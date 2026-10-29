/** Wave 13: chats between players: emoji, voice notes and cards for things done together. */
export const chatWave13: Record<string, string> = {
  // Composer and emoji
  'No messages yet. Say hello 👋': 'Pas encore de messages. Dites bonjour 👋',
  Emoji: 'Émojis',
  'Emoji categories': 'Catégories d’émojis',
  'Insert {emoji}': 'Insérer {emoji}',
  Smileys: 'Smileys',
  Hearts: 'Cœurs',
  Food: 'Nourriture',
  Activities: 'Activités',
  'Work & money': 'Travail et argent',
  // Voice notes
  'Record a voice note': 'Enregistrer un message vocal',
  'Recording a voice note': 'Enregistrement d’un message vocal',
  'Send voice note': 'Envoyer le vocal',
  'Sending…': 'Envoi…',
  'Voice note': 'Message vocal',
  'Play voice note': 'Écouter le message vocal',
  'Pause voice note': 'Mettre le vocal en pause',
  'Couldn’t play that voice note.': 'Impossible de lire ce message vocal.',
  'That voice note is too long.': 'Ce message vocal est trop long.',
  'Too short. Hold on a moment longer.': 'Trop court. Parlez un peu plus longtemps.',
  'Voice notes need a browser that can record audio.':
    'Les messages vocaux demandent un navigateur capable d’enregistrer du son.',
  'No microphone. Allow it for this site in your browser settings to send voice notes.':
    'Pas de micro. Autorisez-le pour ce site dans les réglages du navigateur pour envoyer des vocaux.',
  // Doing things together
  'Do something together': 'Faire quelque chose ensemble',
  'Plan a date': 'Proposer un rendez-vous',
  'Tech event together': 'Un événement tech ensemble',
  'Give a home': 'Offrir un logement',
  'Send the invitation': 'Envoyer l’invitation',
  'Date invitation sent.': 'Invitation au rendez-vous envoyée.',
  'Invitation sent.': 'Invitation envoyée.',
  'You both need to be in the same city. {name} chooses whether to accept.':
    'Vous devez être dans la même ville. {name} choisit d’accepter ou non.',
  'At my home (invite them over first)': 'Chez moi (invitez d’abord la personne)',
  'Has a mortgage: pay it off first.': 'Hypothéqué : remboursez d’abord le prêt.',
  'Let to tenants: end the let first.': 'Loué : mettez d’abord fin à la location.',
  'You live here: you’d move out.': 'Vous y vivez : vous déménageriez.',
  'You don’t own a home yet. Buy one in Homes.':
    'Vous n’avez pas encore de logement. Achetez-en un dans Logements.',
  'A gift, not a sale: no money changes hands. {name} pays its running costs from then on.':
    'Un cadeau, pas une vente : aucun argent ne change de mains. {name} paiera ensuite les charges.',
  'Give it to {name}': 'L’offrir à {name}',
  'Offer sent. It’s theirs once they accept.':
    'Offre envoyée. Le logement sera à eux s’ils acceptent.',
  // Cards
  'You sent {amount}': 'Vous avez envoyé {amount}',
  '{name} sent you {amount}': '{name} vous a envoyé {amount}',
  'Fee {amount}': 'Frais {amount}',
  'View receipt': 'Voir le reçu',
  'Open Bank': 'Ouvrir la Banque',
  'You asked {name} on a date': 'Vous avez proposé un rendez-vous à {name}',
  '{name} asked you on a date': '{name} vous propose un rendez-vous',
  'At home': 'À la maison',
  'Accept date': 'Accepter le rendez-vous',
  'It’s a date.': 'C’est un rendez-vous.',
  'Call it off': 'Annuler',
  'Open the date': 'Ouvrir le rendez-vous',
  'You invited {name} over': 'Vous avez invité {name} chez vous',
  'You offered {name} a home': 'Vous avez offert un logement à {name}',
  '{name} wants to give you a home': '{name} veut vous offrir un logement',
  'Worth about {amount}': 'Valeur d’environ {amount}',
  'Accept the home': 'Accepter le logement',
  'You declined the gift.': 'Vous avez refusé le cadeau.',
  'Offer withdrawn.': 'Offre retirée.',
  'Take it back': 'Reprendre l’offre',
  'See it in Homes': 'Le voir dans Logements',
  'You asked {name} to {event}': 'Vous avez invité {name} à {event}',
  '{name} asked you to {event}': '{name} vous invite à {event}',
  'Going: {names}': 'Y vont : {names}',
  You: 'Vous',
  'Go together': 'Y aller ensemble',
  'Waiting for an answer': 'En attente de réponse',
  'Together now': 'Ensemble maintenant',
  Ended: 'Terminé',
  'No longer available': 'Plus disponible',
  Over: 'Fini',
  // Message summaries from the server (chat lists, notifications)
  '💸 Payment': '💸 Paiement',
  '🎤 Voice note': '🎤 Message vocal',
  '🌇 Date invitation': '🌇 Invitation à un rendez-vous',
  '🏠 Come over to mine': '🏠 Viens chez moi',
  '🎁 A home, as a gift': '🎁 Un logement en cadeau',
  '🎟 Tech event together': '🎟 Événement tech ensemble',
  // Server refusals
  'That isn’t a voice note we can play.': 'Ce n’est pas un message vocal que nous pouvons lire.',
  'Voice note not found.': 'Message vocal introuvable.',
  'That can’t be done from this chat.': 'Impossible depuis cette conversation.',
  'You can only give a home to another player.':
    'Vous ne pouvez offrir un logement qu’à un autre joueur.',
  'Give it to someone else.': 'Offrez-le à quelqu’un d’autre.',
  'That player has left the game.': 'Ce joueur a quitté le jeu.',
  'It has a mortgage. Pay it off (or sell) before giving it away.':
    'Il est hypothéqué. Remboursez le prêt (ou vendez) avant de l’offrir.',
  'It’s let to tenants. End the let before giving it away.':
    'Il est loué. Mettez fin à la location avant de l’offrir.',
  'You’ve already offered that home.': 'Vous avez déjà offert ce logement.',
  'Wait for answers to your other offers first.':
    'Attendez d’abord les réponses à vos autres offres.',
  'We can’t find that gift.': 'Nous ne trouvons pas ce cadeau.',
  'That gift has already been answered.': 'Ce cadeau a déjà reçu une réponse.',
  // Playtest round 7: play a game from Messages
  'Play a game': 'Jouer à un jeu',
  'A free game, for fun.': 'Une partie gratuite, pour le plaisir.',
  'Called off · stakes back': 'Annulée · mises remboursées',
  'Called off.': 'Annulé.',
  'Expires in {n} min · their stake is in the pot':
    'Expire dans {n} min · sa mise est dans la cagnotte',
  'Game over · a tie': 'Partie terminée · égalité',
  'Game over · you won the pot': 'Partie terminée · vous remportez la cagnotte',
  'Game over · {name} won': 'Partie terminée · {name} a gagné',
  'If {name} doesn’t answer in 30 minutes, it’s off.':
    'Si {name} ne répond pas dans les 30 minutes, c’est annulé.',
  'Invitation sent. When {name} accepts, you’re both taken to the table.':
    'Invitation envoyée. Quand {name} accepte, vous êtes tous les deux conduits à la table.',
  'Invite {name} · free game': 'Inviter {name} · partie gratuite',
  'Nowhere in this city runs that game right now.':
    'Aucun lieu de cette ville ne propose ce jeu pour le moment.',
  'Play with {name}': 'Jouer avec {name}',
  'Pot {pot}. Winner takes it; a tie or a no gives the stakes back.':
    'Cagnotte {pot}. Le gagnant la remporte ; une égalité ou un refus rembourse les mises.',
  'Waiting for {name} · expires in {n} min, then your stake comes back':
    'En attente de {name} · expire dans {n} min, puis votre mise vous revient',
  'your home': 'chez vous',
  '{game} with {name}': '{game} avec {name}',
};
