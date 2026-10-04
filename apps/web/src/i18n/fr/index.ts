/** The French catalog, merged from one file per screen. */
import { app } from './app';
import { city } from './city';
import { company } from './company';
import { entry } from './entry';
import { me } from './me';
import { money } from './money';
import { people } from './people';
import { server } from './server';

export const FR_PARTS: Record<string, Record<string, string>> = {
  app,
  city,
  entry,
  company,
  money,
  me,
  people,
  server,
};

export const FR: Record<string, string> = Object.assign({}, ...Object.values(FR_PARTS));
