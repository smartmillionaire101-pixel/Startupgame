/** French catalog fragment: guest play, saving progress and email sign-in. */
export const account: Record<string, string> = {
  // Sign-in screen
  'I confirm I’m 18 or older': 'Je confirme avoir 18 ans ou plus',
  'Play now': 'Jouer maintenant',
  'Confirm you are 18 or older to play.': 'Confirmez avoir 18 ans ou plus pour jouer.',
  'No sign-up needed. You can save your progress with an email later.':
    'Aucune inscription. Vous pourrez enregistrer votre progression avec un email plus tard.',
  'Already saved? Log in': 'Déjà enregistré ? Connectez-vous',
  'Log in': 'Se connecter',
  'Email me a sign-in link': 'Recevoir un lien de connexion',

  // Email link form
  Email: 'Email',
  'Email me a link': 'Recevoir un lien par email',
  'No password needed: we email you a one-time link.':
    'Pas de mot de passe : nous vous envoyons un lien à usage unique.',
  'Check your inbox: we sent a link to {email}. It expires in 15 minutes.':
    'Consultez votre boîte de réception : nous avons envoyé un lien à {email}. Il expire dans 15 minutes.',
  'Open it in this browser to finish saving. Your game stays here meanwhile.':
    'Ouvrez-le dans ce navigateur pour terminer l’enregistrement. Votre partie reste ici en attendant.',
  'Preview: open your sign-in link': 'Aperçu : ouvrir votre lien de connexion',
  'Use a different email': 'Utiliser un autre email',
  'Email sign-in isn’t switched on yet.': 'La connexion par email n’est pas encore activée.',
  'Progress saved. Log in with {email} on any device.':
    'Progression enregistrée. Connectez-vous avec {email} sur n’importe quel appareil.',
  'Signed in as {email}.': 'Connecté en tant que {email}.',

  // Saving progress
  'Save progress': 'Enregistrer la progression',
  'Saving lets you come back on any device. Without it, your game lives only in this browser.':
    'Enregistrer vous permet de revenir sur n’importe quel appareil. Sinon, votre partie ne vit que dans ce navigateur.',
  'Keep your game': 'Gardez votre partie',
  'Not now': 'Pas maintenant',
  'Playing as a guest: your game lives only in this browser.':
    'Vous jouez en invité : votre partie ne vit que dans ce navigateur.',
  'Saved as {email}': 'Enregistré avec {email}',
  'Log in with this email on any device.':
    'Connectez-vous avec cet email sur n’importe quel appareil.',
  'Guest: not saved yet': 'Invité : pas encore enregistré',

  // Leaving as a guest
  'Leave this game?': 'Quitter cette partie ?',
  'You’ll lose this game unless you save it with an email.':
    'Vous perdrez cette partie si vous ne l’enregistrez pas avec un email.',
  'Leave anyway': 'Quitter quand même',

  // Server answers
  'Enter a valid email address.': 'Saisissez une adresse email valide.',
  'This sign-in link has expired or was already used. Ask for a new one.':
    'Ce lien de connexion a expiré ou a déjà été utilisé. Demandez-en un nouveau.',
  'That email already has a saved game. Log in with it instead.':
    'Cet email a déjà une partie enregistrée. Connectez-vous plutôt avec.',
  'Too many tries. Wait a few minutes and try again.':
    'Trop d’essais. Attendez quelques minutes et réessayez.',
  'We couldn’t send the email. Try again.': 'Nous n’avons pas pu envoyer l’email. Réessayez.',
};
