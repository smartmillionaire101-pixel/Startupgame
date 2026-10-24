/**
 * First class, properly (player feedback: the return is always economy; the
 * first class flight should show how it really is, with a lounge to wait
 * in): return tickets and both legs on the ticket, the business and first
 * class lounge, and the suite in flight with its timeline and acts.
 */
export const firstClass: Record<string, string> = {
  // Booking a return (CabinPicker, the ticket).
  'And home to {city}?': 'Et le retour vers {city} ?',
  'Both legs are charged now; the way home is on your ticket.':
    'Les deux trajets sont débités maintenant ; le retour figure sur votre billet.',
  'Cabin home': 'Classe du retour',
  'One way': 'Aller simple',
  Return: 'Aller-retour',
  Trip: 'Voyage',
  'Outbound: {from} → {to}': 'Aller : {from} → {to}',
  'Return: {from} → {to}': 'Retour : {from} → {to}',
  'Use my return ticket': 'Utiliser mon billet retour',
  'You hold a return ticket home in {cabin}, already paid.':
    'Vous avez un billet retour en {cabin}, déjà payé.',
  'Your return ticket · paid': 'Votre billet retour · payé',
  'Your {cabin} return is refunded, and this one charged.':
    'Votre retour en {cabin} est remboursé, et celui-ci débité.',
  'paid when you booked': 'payé à la réservation',
  'Cancel · keep my return ticket': 'Annuler · garder mon billet retour',
  // The lounge (AirportScene, Lounge).
  'Flying {cabin} to {city}': 'Vole en {cabin} vers {city}',
  'Your flight': 'Votre vol',
  '{flight} to {city} is now boarding': 'Le vol {flight} pour {city} est en embarquement',
  'Boarding: go to the gate for {city}': 'Embarquement : à la porte pour {city}',
  'Quiet room': 'Salle de repos',
  'Shower suites': 'Suites douche',
  'Say hello': 'Dire bonjour',
  'Waiting in style': 'Attendre avec style',
  'Your flight isn’t called yet. The lounge is yours: what would you like?':
    'Votre vol n’est pas encore appelé. Le salon est à vous : que désirez-vous ?',
  'Your flight isn’t called yet. What would you like while you wait?':
    'Votre vol n’est pas encore appelé. Que voulez-vous faire en attendant ?',
  'Dine à la carte': 'Dîner à la carte',
  'Hot buffet': 'Buffet chaud',
  'Champagne at the bar': 'Champagne au bar',
  'A drink at the bar': 'Un verre au bar',
  'Shower suite': 'Suite douche',
  'Daybed in the quiet room': 'Lit de repos dans la salle de repos',
  'Rest in the quiet area': 'Se reposer dans l’espace calme',
  'Meet the other travellers': 'Rencontrer les autres voyageurs',
  'Hunger {n}': 'Faim {n}',
  'Hygiene {n}': 'Hygiène {n}',
  'Fun {n}': 'Plaisir {n}',
  '{h}h back this month': '{h} h regagnées ce mois-ci',
  'Venture partner, flying to a board meeting':
    'Associée d’un fonds, en route pour un conseil d’administration',
  'Founder, Series B in the bag': 'Fondateur, série B en poche',
  'Bank chief executive': 'Directeur général de banque',
  'Private equity partner': 'Associé en capital-investissement',
  'Family office principal': 'Dirigeante d’un family office',
  'Surgeon, off to a conference': 'Chirurgien, en route pour un congrès',
  // The flight (Suite).
  'Take-off': 'Décollage',
  Meal: 'Repas',
  Arrival: 'Arrivée',
  'Dine on demand': 'Repas à la demande',
  'Three-course meal': 'Repas en trois plats',
  'Turndown: make up my bed': 'Préparer mon lit',
  'Lie flat and sleep': 'S’allonger et dormir',
  'Onboard bar': 'Bar à bord',
  'Shower spa': 'Spa avec douche',
  'Caviar with blinis and crème fraîche': 'Caviar, blinis et crème fraîche',
  'Seared scallops, cauliflower purée': 'Saint-Jacques snackées, purée de chou-fleur',
  'Fillet of beef, jollof risotto, greens': 'Filet de bœuf, risotto jollof, légumes verts',
  'A selection of cheeses': 'Une sélection de fromages',
  'Chocolate fondant, vanilla ice cream': 'Fondant au chocolat, glace vanille',
  'Smoked salmon salad': 'Salade de saumon fumé',
  'Chicken suya with plantain': 'Poulet suya et banane plantain',
  'Lemon tart': 'Tarte au citron',
  'First class suite': 'Suite de première classe',
  'Business class seat': 'Siège en classe affaires',
  'Flying first class': 'En première classe',
  'Flying business class': 'En classe affaires',
  'Close the doors': 'Fermer les portes',
  'Open the doors': 'Ouvrir les portes',
  'Next: {stage}': 'Ensuite : {stage}',
  'On arrival: {fx}': 'À l’arrivée : {fx}',
  'Prepare for landing': 'Préparer l’atterrissage',
  'Serve the next course': 'Servir le plat suivant',
  'Tonight’s menu': 'Le menu du soir',
  'What your cabin includes': 'Ce que comprend votre classe',
  'You land rested.': 'Vous atterrissez reposé.',
  '{name}: Welcome aboard. A glass of champagne? Your pyjamas and kit are on the ottoman.':
    '{name} : Bienvenue à bord. Une coupe de champagne ? Votre pyjama et votre trousse sont sur le pouf.',
  '{name}: Welcome aboard. Something to drink before we take off?':
    '{name} : Bienvenue à bord. Quelque chose à boire avant le décollage ?',
  '{name}: Whenever you’re ready, I’ll serve the menu course by course.':
    '{name} : Quand vous voulez, je vous sers le menu plat par plat.',
  '{name}: Dinner is three courses tonight. Shall I bring the first?':
    '{name} : Le dîner est en trois plats ce soir. Je vous apporte le premier ?',
  '{name}: Shall I make up your bed? I’ll close the doors for you.':
    '{name} : Je vous prépare votre lit ? Je fermerai les portes pour vous.',
  '{name}: Your seat goes fully flat. Sleep well.':
    '{name} : Votre siège devient entièrement plat. Dormez bien.',
  '{name}: Good morning. We land in {city} shortly.':
    '{name} : Bonjour. Nous atterrissons bientôt à {city}.',
  // Server messages (travel.book, travel.lounge, travel.inflight).
  'Return tickets aren’t on sale yet.': 'Les billets aller-retour ne sont pas encore en vente.',
  'You’re flying home: there’s no way back to book.':
    'Vous rentrez chez vous : pas de retour à réserver.',
  'You already hold a ticket home. Use it, or cancel it from the airport.':
    'Vous avez déjà un billet retour. Utilisez-le, ou annulez-le à l’aéroport.',
  'The lounge is for business and first class tickets. Wait at the gate.':
    'Le salon est réservé aux billets affaires et première. Attendez à la porte.',
  'You’ve done that already. Your flight is called soon.':
    'C’est déjà fait. Votre vol sera bientôt appelé.',
  'They’re not in the lounge any more.': 'Cette personne n’est plus dans le salon.',
  'A hot plate from the buffet.': 'Une assiette chaude au buffet.',
  'Lunch à la carte at a table by the window.': 'Un déjeuner à la carte près de la baie vitrée.',
  'A glass at the bar.': 'Un verre au bar.',
  'A glass of champagne at the bar.': 'Une coupe de champagne au bar.',
  'A hot shower: you feel fresh.': 'Une douche chaude : vous vous sentez frais.',
  'The shower suite: rain shower, fresh towels, you feel new.':
    'La suite douche : douche à l’italienne, serviettes propres, vous voilà neuf.',
  'A rest in a quiet armchair.': 'Un moment de repos dans un fauteuil au calme.',
  'A nap on a daybed in the quiet room.': 'Une sieste sur un lit de repos dans la salle de repos.',
  'You chat with the travellers by the window.':
    'Vous discutez avec les voyageurs près de la baie vitrée.',
  'You meet the people flying up front.': 'Vous rencontrez les passagers de l’avant.',
  'That’s for business and first class flights.':
    'C’est réservé aux vols en affaires et en première.',
  'There’s no onboard bar on this flight.': 'Il n’y a pas de bar à bord sur ce vol.',
  'There’s no shower on this flight.': 'Il n’y a pas de douche sur ce vol.',
  'That isn’t offered on this flight.': 'Ce n’est pas proposé sur ce vol.',
  'You’ve done that on this flight already.': 'C’est déjà fait sur ce vol.',
  'You worked through the night: no time left to sleep.':
    'Vous avez travaillé toute la nuit : plus le temps de dormir.',
  'You slept through: no time left to work.':
    'Vous avez dormi tout le vol : plus le temps de travailler.',
  'Three courses on china, served at your seat.':
    'Trois plats dans de la porcelaine, servis à votre siège.',
  'The chef’s menu, course by course, with champagne.':
    'Le menu du chef, plat après plat, avec du champagne.',
  'You lie flat and sleep for most of the flight.':
    'Vous vous allongez et dormez presque tout le vol.',
  'Turndown service: a real bed, pyjamas, the doors closed. You sleep well.':
    'Service de couverture : un vrai lit, un pyjama, les portes fermées. Vous dormez bien.',
  'A film on your screen with noise-cancelling headphones.':
    'Un film sur votre écran avec un casque à réduction de bruit.',
  'A film on your wide screen, feet up.': 'Un film sur votre grand écran, les pieds surélevés.',
  'You clear your inbox at your seat.': 'Vous videz votre boîte mail depuis votre siège.',
  'You work at your desk in the suite, undisturbed.':
    'Vous travaillez au bureau de votre suite, sans être dérangé.',
  'A drink at the onboard bar with other passengers.':
    'Un verre au bar à bord avec d’autres passagers.',
  'A shower in the onboard spa before landing.': 'Une douche au spa de bord avant l’atterrissage.',
};
