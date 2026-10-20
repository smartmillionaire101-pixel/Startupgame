/** The French catalog, merged from one file per screen. */
import { account } from './account';
import { landing } from './landing';
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
import { city3d } from './city3d';
import { drive } from './drive';
import { interiorsWave9 } from './interiors-wave9';
import { wave10 } from './wave10';
import { homeWave12 } from './home-wave12';
import { wave12Sky } from './wave12-sky';
import { chatWave13 } from './chat-wave13';
import { bankStatement } from './bank-statement';
import { journey } from './journey';
import { investorJourney } from './investor-journey';
import { onlinePlay } from './online-play';
import { roadmap } from './roadmap';
import { sales } from './sales';
import { hiring } from './hiring';
import { founderFinance } from './founder-finance';
import { recap } from './recap';
import { decisions } from './decisions';
import { capital } from './capital';
import { investorCareer } from './investor-career';
import { investorExchange } from './investor-exchange';
import { investorSyndicates } from './investor-syndicates';
import { investorFunds } from './investor-funds';
import { investorFundOps } from './investor-fundops';
import { investorFirm } from './investor-firm';
import { investorAllocators } from './investor-allocators';
import { investorDealcraft } from './investor-dealcraft';
import { investorLegacy } from './investor-legacy';
import { tutorial } from './tutorial';
import { uiFixes } from './ui-fixes';
import { feedback } from './feedback';
import { lifeBars } from './lifebars';
import { moneyView } from './money-view';
import { cityAlive } from './city-alive';
import { simple } from './simple';
import { pitchFigures } from './pitch-figures';
import { avatar } from './avatar';
import { roundTwo } from './round-two';
import { lifeEvents } from './life-events';
import { homePhotos } from './home-photos';
import { hotels } from './hotels';
import { hotelRoom } from './hotel-room';
import { arrivalsLive } from './arrivals-live';
import { nightlife } from './nightlife';
import { holidays } from './holidays';
import { golfMall } from './golf-mall';
import { golfHud } from './golf-hud';
import { goingOut } from './going-out';
import { mapBadges } from './map-badges';
import { mallWalk } from './mall-walk';
import { golfMatch } from './golf-match';
import { jobsPro } from './jobs-pro';

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
  city3d,
  drive,
  interiorsWave9,
  wave10,
  homeWave12,
  wave12Sky,
  chatWave13,
  bankStatement,
  journey,
  investorJourney,
  onlinePlay,
  roadmap,
  sales,
  hiring,
  founderFinance,
  recap,
  decisions,
  capital,
  investorCareer,
  investorExchange,
  investorSyndicates,
  investorFunds,
  investorFundOps,
  investorFirm,
  investorAllocators,
  investorDealcraft,
  investorLegacy,
  tutorial,
  uiFixes,
  feedback,
  lifeBars,
  moneyView,
  cityAlive,
  simple,
  pitchFigures,
  landing,
  avatar,
  roundTwo,
  lifeEvents,
  homePhotos,
  hotels,
  hotelRoom,
  arrivalsLive,
  nightlife,
  holidays,
  golfMall,
  golfHud,
  goingOut,
  mapBadges,
  mallWalk,
  golfMatch,
  jobsPro,
};

export const FR: Record<string, string> = Object.assign({}, ...Object.values(FR_PARTS));
