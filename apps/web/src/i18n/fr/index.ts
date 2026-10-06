/** The French catalog, merged from one file per screen. */
import { account } from './account';
import { app } from './app';
import { city } from './city';
import { company } from './company';
import { economy } from './economy';
import { entry } from './entry';
import { me } from './me';
import { money } from './money';
import { people } from './people';
import { peopleWave6 } from './people-wave6';
import { phone } from './phone';
import { places } from './places';
import { server } from './server';
import { travel } from './travel';
import { travelWave7 } from './travel-wave7';

export const FR_PARTS: Record<string, Record<string, string>> = {
  account,
  app,
  city,
  economy,
  entry,
  company,
  money,
  me,
  people,
  peopleWave6,
  phone,
  places,
  server,
  travel,
  travelWave7,
};

export const FR: Record<string, string> = Object.assign({}, ...Object.values(FR_PARTS));
