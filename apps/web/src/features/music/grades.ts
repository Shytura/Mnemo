import type { RecordGrade } from '@mnemo/core';

export type GradeKey = 'M' | 'NM' | 'VGplus' | 'VG' | 'Gplus' | 'G' | 'F' | 'P';

/** Translation key of a Goldmine grade; i18n keys cannot contain `+`. */
export const gradeKey = (grade: RecordGrade) => grade.replace('+', 'plus') as GradeKey;
