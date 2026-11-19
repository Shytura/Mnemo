import { Button, cn, Spinner } from '@mnemo/ui';
import { FlashlightIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Detector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}

interface NativeDetector {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

type ScanError = 'insecure' | 'denied' | 'noCamera' | 'failed';

/** Product barcodes: EAN-13 (books, European releases) and UPC-A (North American releases). */
const FORMATS: Array<'ean_13' | 'upc_a'> = ['ean_13', 'upc_a'];

/**
 * The browser's own barcode reader where there is one (Chrome on Android, Safari 17+ on some
 * devices), otherwise the ZXing ponyfill. Its WebAssembly is bundled, not fetched from a CDN,
 * so scanning keeps working offline once the app is installed.
 */
async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetector }).BarcodeDetector;
  const supported = Native ? await Native.getSupportedFormats() : [];
  if (Native && supported.includes('ean_13')) {
    return new Native({ formats: FORMATS.filter((f) => supported.includes(f)) });
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? wasmUrl : prefix + path,
    },
  });
  return new BarcodeDetector({ formats: FORMATS });
}

function errorOf(error: unknown): ScanError {
  const name = (error as { name?: string } | undefined)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'noCamera';
  return 'failed';
}

interface BarcodeScannerProps {
  /** Turns a raw barcode into the code the caller wants, or rejects it with `undefined`. */
  read: (raw: string) => string | undefined;
  onDetect: (code: string) => void;
  onCancel: () => void;
  /** Shown below the frame, e.g. where to find the barcode. */
  hint: string;
  /** Added to error messages: what to do without the camera. */
  fallback: string;
}

/**
 * Camera view that reports the first barcode `read` accepts and then stops the camera. Books
 * read ISBNs from it, records their EAN or UPC.
 */
export function BarcodeScanner({ read, onDetect, onCancel, hint, fallback }: BarcodeScannerProps) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'scanning' | ScanError>('starting');
  const [torch, setTorch] = useState<{ on: boolean; track: MediaStreamTrack } | null>(null);
  const report = useRef(onDetect);
  report.current = onDetect;
  const accept = useRef(read);
  accept.current = read;

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState('insecure');
      return;
    }
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };

    (async () => {
      try {
        const [detector, media] = await Promise.all([
          createDetector(),
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          }),
        ]);
        stream = media;
        if (stopped || !video.current) return stop();
        video.current.srcObject = media;
        await video.current.play();
        setState('scanning');

        const [track] = media.getVideoTracks();
        const capabilities = track?.getCapabilities?.() as { torch?: boolean } | undefined;
        if (track && capabilities?.torch) setTorch({ on: false, track });

        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            const code = codes.map((c) => accept.current(c.rawValue)).find(Boolean);
            if (code) {
              stop();
              navigator.vibrate?.(60);
              report.current(code);
              return;
            }
          } catch {
            // A frame that cannot be read (e.g. while the video starts) is simply skipped.
          }
          timer = setTimeout(tick, 200);
        };
        void tick();
      } catch (error) {
        stop();
        setState(errorOf(error));
      }
    })();

    return stop;
  }, []);

  const toggleTorch = async () => {
    if (!torch) return;
    const on = !torch.on;
    await torch.track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    setTorch({ ...torch, on });
  };

  const failed = state !== 'starting' && state !== 'scanning';

  return (
    <div className="relative overflow-hidden rounded-frame bg-[#12110f] text-paper">
      {failed ? (
        <p className="px-6 py-10 text-center text-sm leading-relaxed text-paper/80">
          {t(`scan.${state}`)} {fallback}
        </p>
      ) : (
        <div className="relative aspect-[4/3] max-h-[50vh] w-full">
          <video
            ref={video}
            muted
            playsInline
            className={cn(
              'size-full object-cover transition-opacity duration-500',
              state === 'scanning' ? 'opacity-100' : 'opacity-0',
            )}
          />
          {state === 'starting' && (
            <div className="absolute inset-0 grid place-items-center">
              <Spinner className="border-paper/30 border-t-paper" />
            </div>
          )}
          {/* A frame for the barcode with a slow sweep, so it is clear the camera is reading. */}
          <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[34%] -translate-y-1/2 rounded-[6px] shadow-[0_0_0_100vmax_rgb(0_0_0/0.45)] ring-1 ring-paper/70">
            <span className="absolute inset-x-3 top-1/2 h-px animate-pulse bg-accent shadow-[0_0_12px_2px] shadow-accent/60" />
          </div>
          <p className="absolute inset-x-0 bottom-3 px-4 text-center text-xs text-paper/85">
            {hint}
          </p>
        </div>
      )}
      <div className="absolute top-2 right-2 flex gap-1.5">
        {torch && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={torch.on}
            aria-label={t('scan.torch')}
            onClick={() => void toggleTorch()}
            className={cn(
              'rounded-full bg-black/40 text-paper hover:bg-black/60',
              torch.on && 'text-accent',
            )}
          >
            <FlashlightIcon />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('scan.stop')}
          onClick={onCancel}
          className="rounded-full bg-black/40 text-paper hover:bg-black/60"
        >
          <XIcon />
        </Button>
      </div>
    </div>
  );
}
