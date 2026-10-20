/**
 * Phase 5: life events (the pop-up card, its choices and results). The
 * events' own lines come from the engine (packages/engine/src/data/
 * lifeevents.ts) and are translated here through tx()/t(); a test
 * (test/life-events.test.ts) checks every one has French.
 */
export const lifeEvents: Record<string, string> = {
  // ---- the card
  'City life': 'Vie en ville',
  'Health {n}': 'Santé {n}',
  'Stress {n}': 'Stress {n}',
  'Happiness {n}': 'Bonheur {n}',
  'You get {amount}': 'Vous recevez {amount}',
  'Paid back next month: {amount}': 'Remboursé le mois prochain : {amount}',
  'Could go well or badly ({n}% chance it goes well)':
    'Ça peut bien ou mal tourner ({n} % de chances que ça se passe bien)',
  'If you don’t choose by the end of the month: {choice}':
    'Si vous ne choisissez pas avant la fin du mois : {choice}',
  'You received {amount}': 'Vous avez reçu {amount}',
  'You spent {amount}': 'Vous avez dépensé {amount}',
  'Nothing else changed.': 'Rien d’autre n’a changé.',
  OK: 'OK',
  'Decide later': 'Décider plus tard',
  // ---- refusals shown on the card
  'You don’t have that much in your account.': 'Vous n’avez pas autant sur votre compte.',
  'The company isn’t running any more.': 'L’entreprise ne fonctionne plus.',
  'That decision isn’t yours to make.': 'Cette décision ne vous revient pas.',
  'Pick one of the options.': 'Choisissez une des options.',
  'You’ve already decided that one.': 'Vous avez déjà décidé.',
  'Too late: that one has been decided for you.': 'Trop tard : on a décidé pour vous.',
  // ---- the release note
  'Update: life bars. Energy, Health, Happiness and Stress now show at the top. Walking far takes time and energy, a taxi saves both but costs money, and how you feel changes how well you sell and pitch. Now and then, life throws you a choice: a card pops up and you decide. Refresh to get it; your game is saved.':
    'Mise à jour : les jauges de vie. Énergie, Santé, Bonheur et Stress s’affichent en haut. Marcher loin prend du temps et de l’énergie, un taxi économise les deux mais coûte de l’argent, et votre état change votre façon de vendre et de pitcher. De temps en temps, la vie vous propose un choix : une carte apparaît et vous décidez. Actualisez pour en profiter ; votre partie est sauvegardée.',

  // ---- health
  'Food poisoning': 'Intoxication alimentaire',
  'That street food last night was a mistake. Your stomach is not happy.':
    'La nourriture de rue d’hier soir était une erreur. Votre estomac n’est pas content.',
  'See a doctor': 'Voir un médecin',
  'Medicine and advice. You recover quickly.':
    'Des médicaments et des conseils. Vous vous remettez vite.',
  'A day in bed. Slow, but it works.': 'Une journée au lit. C’est lent, mais ça marche.',
  'Push through it': 'Tenir le coup',
  'You carry on, and feel terrible.': 'Vous continuez, et vous vous sentez très mal.',
  'Burnout warning': 'Alerte épuisement',
  'Long weeks are catching up with you. You can’t sleep and everything feels hard.':
    'Les longues semaines vous rattrapent. Vous ne dormez plus et tout vous paraît difficile.',
  'Take the weekend off': 'Prendre le week-end',
  'No work for two days. You come back calmer.':
    'Deux jours sans travail. Vous revenez plus calme.',
  'Talk to a counsellor': 'Parler à un psychologue',
  'An hour with someone who listens helps a lot.':
    'Une heure avec quelqu’un qui écoute, ça aide beaucoup.',
  'You keep going. It gets worse.': 'Vous continuez. Ça empire.',
  'A gym opens nearby': 'Une salle de sport ouvre près de chez vous',
  '{place} just opened near you, and the first month is free.':
    '{place} vient d’ouvrir près de chez vous, et le premier mois est gratuit.',
  'Sign up and go often': 'S’inscrire et y aller souvent',
  'Sore at first, then stronger and calmer.':
    'Des courbatures au début, puis plus fort et plus serein.',
  'Try one class': 'Essayer un cours',
  'One good session.': 'Une bonne séance.',
  'Not for me': 'Pas pour moi',
  'Nothing changes.': 'Rien ne change.',
  'Noisy neighbours': 'Des voisins bruyants',
  'Music through the wall until 3am, three nights in a row.':
    'De la musique à travers le mur jusqu’à 3 h du matin, trois nuits de suite.',
  'Buy earplugs': 'Acheter des bouchons d’oreilles',
  'Cheap, and you finally sleep.': 'Pas cher, et vous dormez enfin.',
  'Knock and talk to them': 'Frapper et leur parler',
  'Could go well or badly.': 'Ça peut bien ou mal tourner.',
  'They apologise and turn it down. Peace at last.':
    'Ils s’excusent et baissent le son. Enfin la paix.',
  'They don’t care. Now it’s awkward, and still loud.':
    'Ils s’en moquent. C’est gênant maintenant, et toujours bruyant.',
  'Put up with it': 'Faire avec',
  'You lose sleep.': 'Vous manquez de sommeil.',
  'A charity run': 'Une course caritative',
  'Friends are running 10 km for a local hospital and want you to join.':
    'Des amis courent 10 km pour un hôpital du coin et veulent que vous veniez.',
  'Run with them': 'Courir avec eux',
  'Tiring, but you feel great at the finish.': 'Fatigant, mais vous vous sentez super à l’arrivée.',
  'Just donate': 'Juste faire un don',
  'A good cause, and a warm feeling.': 'Une bonne cause, et ça fait chaud au cœur.',

  // ---- money
  'Your landlord raises the rent': 'Votre propriétaire augmente le loyer',
  'A letter under the door: the rent goes up, and the extra for this year is about {amount}.':
    'Une lettre sous la porte : le loyer augmente, et le surplus pour cette année est d’environ {amount}.',
  'Pay it': 'Payer',
  'Annoying, but done.': 'Agaçant, mais c’est réglé.',
  'Push back': 'Négocier',
  'The landlord backs down: no rise this year.':
    'Le propriétaire recule : pas d’augmentation cette année.',
  'No luck. You pay the rise, after an argument.':
    'Pas de chance. Vous payez l’augmentation, après une dispute.',
  'Find a flatmate': 'Trouver un colocataire',
  'Someone shares the cost. Home gets busier.':
    'Quelqu’un partage les frais. La maison est plus animée.',
  'A friend needs a loan': 'Un ami a besoin d’un prêt',
  'An old friend is short this month and asks to borrow {amount}.':
    'Un vieil ami est à court ce mois-ci et vous demande {amount}.',
  'Lend it': 'Prêter',
  'They promise to pay you back next month. Could go well or badly.':
    'Il promet de vous rembourser le mois prochain. Ça peut bien ou mal tourner.',
  'They’ll pay you back next month, with thanks.':
    'Il vous remboursera le mois prochain, avec ses remerciements.',
  'They can’t pay you back. The money is gone.':
    'Il ne peut pas vous rembourser. L’argent est perdu.',
  'Give a little, no strings': 'Donner un peu, sans condition',
  'A smaller gift. They’re grateful.': 'Un plus petit cadeau. Il vous est reconnaissant.',
  'You keep your money. It’s a bit awkward.': 'Vous gardez votre argent. C’est un peu gênant.',
  'A tax refund': 'Un remboursement d’impôts',
  'The tax office says you paid too much last year. {amount} is coming back to you.':
    'Le fisc dit que vous avez trop payé l’an dernier. {amount} vous revient.',
  'Save it': 'L’épargner',
  'The money goes into your account.': 'L’argent arrive sur votre compte.',
  'Treat yourself': 'Se faire plaisir',
  'You spend it on something nice.': 'Vous le dépensez pour quelque chose de sympa.',
  'A parking fine': 'Une amende de stationnement',
  'A ticket on your car’s windscreen. You were sure that spot was fine.':
    'Un PV sur votre pare-brise. Vous étiez sûr que cette place était autorisée.',
  'Pay the fine': 'Payer l’amende',
  'Paid. Lesson learned.': 'Payé. Leçon retenue.',
  'Appeal it': 'Contester',
  'Appeal won. You pay nothing.': 'Contestation gagnée. Vous ne payez rien.',
  'Appeal lost. You pay the fine plus a late fee.':
    'Contestation perdue. Vous payez l’amende plus une majoration.',

  // ---- social
  'A wedding in {city}': 'Un mariage à {city}',
  'A close friend is getting married in {city} and really wants you there.':
    'Un ami proche se marie à {city} et tient vraiment à votre présence.',
  'Go to the wedding': 'Aller au mariage',
  'Travel, dancing, old friends. Tiring but wonderful.':
    'Le voyage, la danse, les vieux amis. Fatigant mais merveilleux.',
  'Send a gift': 'Envoyer un cadeau',
  'They know you care.': 'Ils savent que vous tenez à eux.',
  'Say you can’t come': 'Dire que vous ne pouvez pas venir',
  'You stay home and feel a little sad.': 'Vous restez chez vous, un peu triste.',
  'Your family wants to visit': 'Votre famille veut vous rendre visite',
  'Your parents want to come and stay for a few days.':
    'Vos parents veulent venir passer quelques jours chez vous.',
  'Have them to stay': 'Les accueillir',
  'Home cooking and long talks.': 'De la cuisine maison et de longues discussions.',
  'Video call instead': 'Un appel vidéo à la place',
  'A long call. Nice, not the same.': 'Un long appel. Sympa, mais pas pareil.',
  'They’re disappointed.': 'Ils sont déçus.',
  'A friendly new neighbour': 'Un nouveau voisin sympathique',
  'Someone new moved in next door and says hello on the stairs.':
    'Quelqu’un vient d’emménager à côté et vous salue dans l’escalier.',
  'Invite them for tea': 'L’inviter pour un thé',
  'A new friend on your street.': 'Un nouvel ami dans votre rue.',
  'Just wave': 'Juste faire un signe',

  // ---- work
  'Co-found a startup?': 'Cofonder une startup ?',
  'A friend asks you to co-found their startup. They have an idea and a lot of energy.':
    'Un ami vous propose de cofonder sa startup. Il a une idée et beaucoup d’énergie.',
  'Yes, help them': 'Oui, l’aider',
  'Evenings of work together. Exciting and a bit stressful.':
    'Des soirées de travail ensemble. Excitant et un peu stressant.',
  'No, thanks': 'Non, merci',
  'You stay focused on your own path.': 'Vous restez concentré sur votre propre chemin.',
  'Ask for equity first': 'Demander des parts d’abord',
  'They agree and make you an adviser. You meet their whole network.':
    'Il accepte et fait de vous un conseiller. Vous rencontrez tout son réseau.',
  'They’re offended you asked. It’s awkward now.':
    'Il est vexé que vous ayez demandé. C’est gênant maintenant.',
  'A journalist wants a quote': 'Un journaliste veut une citation',
  'A reporter is writing about startups in {city} and wants a few words from you.':
    'Un reporter écrit sur les startups de {city} et veut quelques mots de vous.',
  'Say something bold': 'Dire quelque chose d’audacieux',
  'Your quote is the headline. People are talking about you.':
    'Votre citation fait le titre. Tout le monde parle de vous.',
  'Your quote comes out wrong. Some people are annoyed.':
    'Votre citation est mal comprise. Certains sont agacés.',
  'Give a careful quote': 'Donner une citation prudente',
  'A short, safe line in the article.': 'Une phrase courte et sans risque dans l’article.',
  'No comment': 'Pas de commentaire',
  'Your laptop breaks before a pitch': 'Votre ordinateur lâche avant un pitch',
  'The screen goes black the night before an important meeting.':
    'L’écran devient noir la veille d’un rendez-vous important.',
  'Buy a new one today': 'En acheter un neuf aujourd’hui',
  'Expensive, but no more worries.': 'Cher, mais plus de soucis.',
  'Get it repaired': 'Le faire réparer',
  'Cheaper. Could go well or badly.': 'Moins cher. Ça peut bien ou mal tourner.',
  'Fixed overnight. Good as new.': 'Réparé dans la nuit. Comme neuf.',
  'The repair doesn’t hold. You pitch from your phone, stressed.':
    'La réparation ne tient pas. Vous pitchez depuis votre téléphone, stressé.',
  'Borrow a friend’s': 'Emprunter celui d’un ami',
  'It works, just about. A stressful day.': 'Ça marche, à peu près. Une journée stressante.',
  'A well-paid job offer': 'Une offre de travail bien payée',
  'An old classmate runs a big company now and offers you some well-paid contract work: {amount}.':
    'Un ancien camarade de classe dirige une grande entreprise et vous propose une mission bien payée : {amount}.',
  'Take the contract': 'Accepter la mission',
  'Long days, but the money is good.': 'De longues journées, mais ça paie bien.',
  'Ask them to keep you in mind': 'Lui demander de penser à vous',
  'A friendly no. The door stays open.': 'Un non amical. La porte reste ouverte.',
  'Coffee with someone successful': 'Un café avec quelqu’un qui a réussi',
  'A well-known founder in {city} has a free hour and offers you a coffee.':
    'Un fondateur connu de {city} a une heure de libre et vous offre un café.',
  'Go and listen': 'Y aller et écouter',
  'Good advice, and a useful contact.': 'De bons conseils, et un contact utile.',
  'Not this time': 'Pas cette fois',
  '{name} is ill': '{name} est malade',
  '{name} at {company} is sick and will be off for a week.':
    '{name}, chez {company}, est malade et sera absent une semaine.',
  'Do their work yourself': 'Faire son travail vous-même',
  'Long hours, but nothing slips.': 'De longues heures, mais rien ne prend de retard.',
  'Pay them to rest properly': 'Le payer pour qu’il se repose vraiment',
  'Paid sick leave. They come back grateful.': 'Un congé maladie payé. Il revient reconnaissant.',
  'Let the work wait': 'Laisser le travail attendre',
  'Things slip, and they feel guilty.': 'Des choses prennent du retard, et il culpabilise.',

  // ---- city
  'A power cut on your street': 'Une coupure de courant dans votre rue',
  'No electricity since this morning, and no one knows when it’s coming back.':
    'Plus d’électricité depuis ce matin, et personne ne sait quand elle reviendra.',
  'Work from a café': 'Travailler dans un café',
  'Coffee, Wi-Fi and a change of scene.': 'Du café, du Wi-Fi et un changement de décor.',
  'Buy a power bank': 'Acheter une batterie externe',
  'Ready for next time, too.': 'Prêt pour la prochaine fois, aussi.',
  'Wait it out': 'Attendre que ça passe',
  'A long, dark, frustrating day.': 'Une longue journée sombre et frustrante.',
  'A street festival': 'Une fête de rue',
  'Music, food stalls and dancing in {city} this weekend.':
    'Musique, stands de nourriture et danse à {city} ce week-end.',
  'A brilliant evening.': 'Une soirée géniale.',
  'Stay in': 'Rester chez soi',
  'Your phone is stolen': 'On vous a volé votre téléphone',
  'One moment it was in your pocket on the bus, the next it was gone.':
    'Il était dans votre poche dans le bus, et l’instant d’après il avait disparu.',
  'Buy a new phone': 'Acheter un nouveau téléphone',
  'Back online today.': 'De nouveau en ligne aujourd’hui.',
  'Buy a cheap used one': 'En acheter un d’occasion pas cher',
  'Slow, but it works.': 'Lent, mais ça marche.',
  'Do without for a while': 'S’en passer quelque temps',
  'Peaceful, and very stressful.': 'Paisible, et très stressant.',
  'Your car breaks down': 'Votre voiture tombe en panne',
  'A strange noise, some smoke, and the car won’t start.':
    'Un bruit bizarre, un peu de fumée, et la voiture ne démarre plus.',
  'Take it to a garage': 'L’emmener au garage',
  'Fixed properly.': 'Réparée correctement.',
  'Try a cheap mechanic': 'Essayer un mécanicien pas cher',
  'A bargain: it runs like new.': 'Une affaire : elle roule comme neuve.',
  'It breaks again a week later. Buses it is.':
    'Elle retombe en panne une semaine plus tard. Ce sera le bus.',
  'Take buses for now': 'Prendre le bus pour l’instant',
  'Slow, crowded trips for a while.': 'Des trajets lents et bondés pendant un moment.',
};
