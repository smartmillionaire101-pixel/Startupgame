/**
 * Cabin classes (player feedback: economy, business and first, each its own
 * experience): the picker, the airport's perks, the cabin's service card and
 * the chauffeur in Arrivals.
 */
export const flightClasses: Record<string, string> = {
  // The picker (CabinPicker).
  'First class': 'Première classe',
  'Cabin class': 'Classe de voyage',
  'How do you want to fly to {city}?': 'Comment voulez-vous voyager jusqu’à {city} ?',
  'Standard seat': 'Siège standard',
  'Meal on a tray': 'Repas sur plateau',
  'Queues at the airport': 'Files d’attente à l’aéroport',
  'Lie-flat seat': 'Siège-lit',
  'Lounge access': 'Accès au salon',
  'Priority boarding': 'Embarquement prioritaire',
  'Amenity kit': 'Trousse de voyage',
  'Private suite with a bed': 'Suite privée avec un lit',
  'Champagne and caviar': 'Champagne et caviar',
  'Chauffeur on arrival': 'Chauffeur à l’arrivée',
  'Fairly fresh': 'Plutôt frais',
  '{h}h lost at the airport': '{h} h perdues à l’aéroport',
  // The cabin's service card (CabinService).
  'A narrow seat, three across, knees to the seat in front':
    'Un siège étroit, trois de front, les genoux contre le siège de devant',
  'Chicken or beef, on a plastic tray': 'Poulet ou bœuf, sur un plateau en plastique',
  'Water, juice or a soft drink from the trolley': 'De l’eau, un jus ou un soda servis au chariot',
  'No amenity kit: bring your own earphones': 'Pas de trousse de voyage : apportez vos écouteurs',
  'A wider seat, two across, with more legroom':
    'Un siège plus large, deux de front, plus de place pour les jambes',
  'A hot meal on real cutlery': 'Un repas chaud avec de vrais couverts',
  'Wine or beer with your meal': 'Du vin ou de la bière avec le repas',
  'Earphones and a blanket': 'Des écouteurs et une couverture',
  'A seat that lies flat into a bed, with aisle access':
    'Un siège qui se transforme en lit, avec accès direct à l’allée',
  'Three courses on china, on a white cloth':
    'Trois plats dans de la porcelaine, sur une nappe blanche',
  'Wine, cocktails and coffee whenever you like': 'Vin, cocktails et café quand vous le souhaitez',
  'An amenity kit: socks, an eye mask, lip balm':
    'Une trousse de voyage : chaussettes, masque de nuit, baume à lèvres',
  'Your own suite with a door, made into a real bed':
    'Votre propre suite avec une porte, transformée en vrai lit',
  'Caviar, then the chef’s menu, served when you want it':
    'Du caviar, puis le menu du chef, servi quand vous le voulez',
  'Champagne, poured at your suite': 'Du champagne, servi dans votre suite',
  'Pyjamas, slippers and a designer amenity kit': 'Pyjama, chaussons et une trousse de créateur',
  'Cream leather club chairs and a divan': 'Des fauteuils club en cuir crème et un divan',
  'Whatever you asked the chef for': 'Tout ce que vous avez demandé au chef',
  // The airport (AirportScene, halls).
  'Waiting area': 'Salle d’attente',
  'Private check-in: a host takes your bags, no queue.':
    'Enregistrement privé : un hôte prend vos bagages, sans attente.',
  'Priority check-in: the short queue.': 'Enregistrement prioritaire : la file courte.',
  'Economy check-in: join the queue.': 'Enregistrement économique : faites la queue.',
  'The first class lounge: à la carte dining, champagne and a spa. Investors wait for flights too.':
    'Le salon première classe : dîner à la carte, champagne et spa. Les investisseurs attendent aussi leur vol.',
  'The business lounge: a hot meal, a quiet desk and a shower. Investors wait for flights too.':
    'Le salon affaires : un repas chaud, un bureau au calme et une douche. Les investisseurs attendent aussi leur vol.',
  'No lounge in economy: a seat by the gate. Investors wait for flights too.':
    'Pas de salon en classe économique : un siège près de la porte. Les investisseurs attendent aussi leur vol.',
  'You board first, straight to your suite.':
    'Vous embarquez en premier, directement vers votre suite.',
  'Priority boarding: you’re on before the queue.':
    'Embarquement prioritaire : vous montez avant la file.',
  'Economy boards by rows, after everyone else.':
    'La classe économique embarque par rangées, après tout le monde.',
  'First class lounge': 'Salon première classe',
  'Business lounge': 'Salon affaires',
  // Arrivals.
  'Your chauffeur': 'Votre chauffeur',
  'Fast track: no queue. The officer stamps your passport.':
    'Coupe-file : pas d’attente. L’agent tamponne votre passeport.',
  'Belt {n}: your bag, tagged priority, comes off first.':
    'Tapis {n} : votre bagage, étiqueté prioritaire, sort en premier.',
  'Your chauffeur is waiting at the barrier to drive you to {hotel}.':
    'Votre chauffeur vous attend à la barrière pour vous conduire à {hotel}.',
  'Your chauffeur is waiting at the barrier with your name.':
    'Votre chauffeur vous attend à la barrière avec votre nom.',
  'Chauffeur included': 'Chauffeur inclus',
  // Server messages (travel.book).
  'Only economy is on sale for now.': 'Seule la classe économique est en vente pour l’instant.',
};
