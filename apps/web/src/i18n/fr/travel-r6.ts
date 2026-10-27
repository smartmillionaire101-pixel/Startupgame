/**
 * Play-test round 6 (travel, rides, games, hotels, events): the strings the
 * fixes added or changed.
 */
export const travelR6: Record<string, string> = {
  // Booking a trip (CabinPicker).
  'One way: the flight home isn’t booked. You pay for it when you book it.':
    'Aller simple : le vol retour n’est pas réservé. Vous le payez en le réservant.',
  // Leaving a game (PlayHost).
  'Leave the game?': 'Quitter la partie ?',
  'You forfeit it: the others win, and the pot goes to them.':
    'Vous abandonnez : les autres gagnent, et la cagnotte est pour eux.',
  'Your game ends here.': 'Votre partie s’arrête ici.',
  'The table is called off and every entry refunded.':
    'La table est annulée et chaque mise remboursée.',
  'You leave the table and your entry is refunded.':
    'Vous quittez la table et votre mise est remboursée.',
  'Leave the game': 'Quitter la partie',
  'Keep playing': 'Continuer à jouer',
  'Stay at the table': 'Rester à la table',
  'You’re still in “{title}” at {venue}. Leave it to start another game.':
    'Vous êtes encore dans « {title} » à {venue}. Quittez-la pour lancer une autre partie.',
  'You’re still in “{title}”. Leave it to start another game.':
    'Vous êtes encore dans « {title} ». Quittez-la pour lancer une autre partie.',
  'Back to that game': 'Revenir à cette partie',
  'Leave that game (forfeit)': 'Quitter cette partie (abandon)',
  'Leave that game': 'Quitter cette partie',
  'The pot is shared between them.': 'La cagnotte est partagée entre eux.',
  // Bowling: the score with bonus balls still to come.
  '{n}+': '{n}+',
  // Events (the phone's Events app).
  Over: 'Fini',
  'Earlier this month ({n})': 'Plus tôt ce mois-ci ({n})',
  'Earlier this month': 'Plus tôt ce mois-ci',
  'Nothing more on this month.': 'Plus rien de prévu ce mois-ci.',
  // The helicopter (AirHost, AirFlight).
  '{price} · 1 hour, with the briefing': '{price} · 1 heure, briefing compris',
  '{price} · {n} hours, with the briefing': '{price} · {n} heures, briefing compris',
  'Helicopter hop': 'Saut en hélicoptère',
  'Private charter': 'Vol privé',
  'You headed back before the first landmark: the city from the air.':
    'Retour avant le premier monument : la ville vue du ciel.',
  'A landmark from the air: {name}': 'Un monument vu du ciel : {name}',
  // Hotels (HotelList).
  '1 star': '1 étoile',
};
