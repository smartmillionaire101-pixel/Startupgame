/** Wave 12 §D: fares charged when booked (the Travel app, the airport desk, the server's refusals). */
export const travelWave12: Record<string, string> = {
  'Booked: {amount} charged.': 'Réservé : {amount} débités.',
  'Ticket cancelled: {amount} refunded.': 'Billet annulé : {amount} remboursés.',
  'Ticket desk: where do you want to go? Choose a flight and book it: the fare is charged now.':
    'Guichet : où voulez-vous aller ? Choisissez un vol et réservez-le : le billet est débité tout de suite.',
  'You missed your flight to {city}. The fare isn’t refunded.':
    'Vous avez raté votre vol pour {city}. Le billet n’est pas remboursé.',
  'You hold a ticket to {city}. Cancel it to book another flight.':
    'Vous avez un billet pour {city}. Annulez-le pour réserver un autre vol.',
  'Cancel ticket · {amount} back': 'Annuler le billet · {amount} remboursés',
  'Paid {amount}': 'Payé {amount}',
  'Cancel your ticket to {city}': 'Annuler votre billet pour {city}',
  'Cancel ticket': 'Annuler le billet',
  'Cancel your ticket to change flights.': 'Annulez votre billet pour changer de vol.',
  'Where do you want to go? Book a flight (the fare is charged now), then check in at the airport.':
    'Où voulez-vous aller ? Réservez un vol (le billet est débité tout de suite), puis enregistrez-vous à l’aéroport.',
  // The server's refusals.
  'You don’t have a ticket. Book a flight first.':
    'Vous n’avez pas de billet. Réservez d’abord un vol.',
  'You don’t have a ticket.': 'Vous n’avez pas de billet.',
  'Your flight has left. Book another one.': 'Votre vol est parti. Réservez-en un autre.',
  'That flight has left; the fare isn’t refundable.':
    'Ce vol est parti ; le billet n’est pas remboursable.',
  'That flight isn’t on sale. Choose one from today’s board.':
    'Ce vol n’est pas en vente. Choisissez-en un sur le tableau du jour.',
};
