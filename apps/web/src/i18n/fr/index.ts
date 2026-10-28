/** The French catalog, merged from one file per screen. */
import { account } from './account';
import { landing } from './landing';
import { buyMode } from './buy-mode';
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
import { tableGames } from './table-games';
import { capital } from './capital';
import { investorCareer } from './investor-career';
import { investorExchange } from './investor-exchange';
import { investorSyndicates } from './investor-syndicates';
import { investorFunds } from './investor-funds';
import { investorFundOps } from './investor-fundops';
import { investorFirm } from './investor-firm';
import { investorAllocators } from './investor-allocators';
import { investorDealcraft } from './investor-dealcraft';
import { investorDealflow } from './investor-dealflow';
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
import { hud } from './hud';
import { goingOut } from './going-out';
import { mapBadges } from './map-badges';
import { mallWalk } from './mall-walk';
import { golfMatch } from './golf-match';
import { r2Golf } from './r2-golf';
import { camera } from './camera';
import { jobsPro } from './jobs-pro';
import { mallMore } from './mall-more';
import { flightClasses } from './flight-classes';
import { firstClass } from './first-class';
import { travelR6 } from './travel-r6';
import { todayWhatnow } from './today-whatnow';
import { cabins } from './cabins';
import { founderGuidance } from './founder-guidance';
import { heliSkydive } from './heli-skydive';
import { restaurants } from './restaurants';
import { wardrobe } from './wardrobe';
import { cityPlaces } from './city-places';
import { hotelList } from './hotel-list';
import { moreGames } from './more-games';
import { capitalExit } from './capital-exit';
import { firstFund } from './first-fund';
import { bankers } from './bankers';
import { bankwork } from './bankwork';
import { jobTasks } from './job-tasks';
import { stocks } from './stocks';
import { outfits } from './outfits';
import { buildings } from './buildings';
import { signup } from './signup';
import { investorGuide } from './investor-guide';
import { bankerRepEvents } from './banker-rep-events';
import { shop } from './shop';
import { r2 } from './r2';
import { r2Ui } from './r2-ui';
import { r2Jobs } from './r2-jobs';
import { convo } from './convo';
import { setup } from './setup';
import { founderPlaytest } from './founder-playtest';
import { r6Ui } from './r6-ui';
import { playtestR7 } from './playtest-r7';
import { salesR7 } from './sales-r7';
import { uiR7 } from './ui-r7';

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
  investorDealflow,
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
  r2Golf,
  camera,
  jobsPro,
  mallMore,
  flightClasses,
  restaurants,
  tableGames,
  wardrobe,
  cityPlaces,
  moreGames,
  capitalExit,
  firstFund,
  bankers,
  bankwork,
  investorGuide,
  bankerRepEvents,
  shop,
  firstClass,
  travelR6,
  jobTasks,
  todayWhatnow,
  stocks,
  outfits,
  cabins,
  hotelList,
  founderGuidance,
  heliSkydive,
  buildings,
  signup,
  r2,
  r2Ui,
  r2Jobs,
  convo,
  buyMode,
  setup,
  founderPlaytest,
  hud,
  r6Ui,
  playtestR7,
  salesR7,
  uiR7,
};

export const FR: Record<string, string> = Object.assign({}, ...Object.values(FR_PARTS));
