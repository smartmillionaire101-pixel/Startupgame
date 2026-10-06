/** The French catalog, merged from one file per screen. */
import { account } from './account';
import { acts } from './acts';
import { app } from './app';
import { city } from './city';
import { company } from './company';
import { economy } from './economy';
import { entry } from './entry';
import { home } from './home';
import { me } from './me';
import { money } from './money';
import { people } from './people';
import { peopleWave6 } from './people-wave6';
import { phone } from './phone';
import { phoneApps } from './phone-apps';
import { places } from './places';
import { server } from './server';
import { travel } from './travel';
import { uiWave7 } from './ui-wave7';
import { travelWave7 } from './travel-wave7';
import { friendsWave8 } from './friends-wave8';
import { uiWave8 } from './ui-wave8';

export const FR_PARTS: Record<string, Record<string, string>> = {
  account,
  acts,
  app,
  city,
  economy,
  entry,
  home,
  company,
  money,
  me,
  people,
  peopleWave6,
  phone,
  phoneApps,
  places,
  server,
  travel,
  uiWave7,
  travelWave7,
  friendsWave8,
  uiWave8,
};

export const FR: Record<string, string> = Object.assign({}, ...Object.values(FR_PARTS));
