/** Round 6 play-test fixes: the game clock, how you're doing, the HUD and the screens around it. */
export const r6Ui: Record<string, string> = {
  // The game clock (the HUD and appointments)
  'Day {day} of month {month}': 'Jour {day} du mois {month}',
  '{day}, {time}': '{day}, {time}',
  '{time}, {day}, in {city}. {n} hours left this month. {mood}. Tap for how you’re doing':
    '{time}, {day}, à {city}. {n} heures restantes ce mois-ci. {mood}. Touchez pour voir comment vous allez',
  // How you're doing
  'Running low.': 'Bientôt à zéro.',
  // How you're doing (from the server)
  'Feeling low: fewer hours next month. Eat, wash and have some fun':
    'Le moral en berne : moins d’heures le mois prochain. Mangez, lavez-vous et amusez-vous un peu',
  'You’re feeling low: next month has fewer hours. Eat, wash, have some fun and see friends.':
    'Vous avez le moral en berne : le mois prochain aura moins d’heures. Mangez, lavez-vous, amusez-vous et voyez des amis.',
  // An email given at sign-up, not confirmed yet
  'Confirm your email': 'Confirmez votre email',
  'Confirm email': 'Confirmer l’email',
  'We’ll email {email} a link. Open it to save your game, then log in on any device.':
    'Nous enverrons un lien à {email}. Ouvrez-le pour sauvegarder votre partie, puis connectez-vous sur n’importe quel appareil.',
  'Confirm {email} to keep your game: we’ll email you a link.':
    'Confirmez {email} pour garder votre partie : nous vous enverrons un lien.',
  'Open the link we email you to save your game and log in on any device.':
    'Ouvrez le lien que nous vous envoyons pour sauvegarder votre partie et vous connecter sur n’importe quel appareil.',
  // The 3D city, too slow on this device
  'The 3D city was running slowly on this device, so you’re on the Lite map now.':
    'La ville en 3D était lente sur cet appareil : vous voici sur la carte Lite.',
  'The 3D city is running slowly on this device. The Lite map is quicker.':
    'La ville en 3D est lente sur cet appareil. La carte Lite est plus rapide.',
  'Back to 3D': 'Revenir à la 3D',
  'Use the Lite map': 'Passer à la carte Lite',
  'Keep 3D': 'Garder la 3D',
  'You can change it in Settings → Map quality.':
    'Vous pouvez la changer dans Réglages → Qualité de la carte.',
  // Home buy mode
  'Add: {thing}': 'Ajouter : {thing}',
  'It’s on its way: it goes here when you unpack the delivery.':
    'Il est en route : il ira ici quand vous déballerez la livraison.',
  'Keep this spot': 'Garder cet endroit',
  'Hang it here': 'L’accrocher ici',
  // The mall's cinema
  'Lights down: {item}': 'Lumières éteintes : {item}',
  'A couple of hours at the cinema: more fun, less stress.':
    'Deux heures au cinéma : plus de plaisir, moins de stress.',
  'Back to the mall': 'Retour au centre commercial',
  'At the mall': 'Au centre commercial',
  '1 decision waiting': '1 décision en attente',
};
