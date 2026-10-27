/**
 * The feedback round's quiz questions (FEEDBACK_NOTE), in the same rows as
 * quiz-bank.ts, one file per set of categories.
 */
import type { Row } from './quiz-bank.js';
import { MORE_1 } from './quiz-more-1.js';
import { MORE_2 } from './quiz-more-2.js';
import { MORE_3 } from './quiz-more-3.js';
import { MORE_4 } from './quiz-more-4.js';

export const MORE_ROWS: readonly Row[] = [...MORE_1, ...MORE_2, ...MORE_3, ...MORE_4];
