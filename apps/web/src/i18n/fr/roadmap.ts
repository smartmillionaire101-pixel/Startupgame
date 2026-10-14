/** The product roadmap: features, lanes, feedback, release notes and the engine's messages. */

/** Feature catalogue (engine data, shown via tx()): [name, blurb, ask] in English and French. */
const FEATURES: [string, string][] = [
  ['Onboarding flow', 'Parcours d’accueil'],
  [
    'A guided first five minutes so new users get value fast.',
    'Cinq premières minutes guidées pour que les nouveaux utilisateurs voient vite l’intérêt.',
  ],
  [
    'I signed up but didn’t know where to start.',
    'Je me suis inscrit mais je ne savais pas par où commencer.',
  ],
  ['Mobile app', 'Application mobile'],
  [
    'A proper phone app instead of a mobile website.',
    'Une vraie application au lieu d’un site mobile.',
  ],
  ['Can I use it on my phone?', 'Je peux l’utiliser sur mon téléphone ?'],
  ['Analytics dashboard', 'Tableau de bord analytique'],
  [
    'Charts that show customers what they get from you.',
    'Des graphiques qui montrent aux clients ce que vous leur apportez.',
  ],
  [
    'I wish I could see my numbers in one place.',
    'J’aimerais voir tous mes chiffres au même endroit.',
  ],
  ['Security audit', 'Audit de sécurité'],
  [
    'Outside experts test your defences; you fix what they find.',
    'Des experts externes testent vos défenses ; vous corrigez ce qu’ils trouvent.',
  ],
  [
    'Our IT team asked how you keep our data safe.',
    'Notre service informatique demande comment vous protégez nos données.',
  ],
  ['Bug bash', 'Chasse aux bugs'],
  [
    'A sprint fixing reported bugs instead of building new things.',
    'Un sprint pour corriger les bugs signalés au lieu de construire du neuf.',
  ],
  ['It crashed again when I tried to save.', 'Ça a encore planté quand j’ai voulu enregistrer.'],
  ['Smart notifications', 'Notifications intelligentes'],
  [
    'Timely reminders that bring people back.',
    'Des rappels au bon moment qui font revenir les gens.',
  ],
  ['I keep forgetting to check it.', 'J’oublie tout le temps d’y jeter un œil.'],
  ['Speed and cost tune-up', 'Optimisation vitesse et coûts'],
  ['Faster pages and cheaper servers.', 'Des pages plus rapides et des serveurs moins chers.'],
  ['It’s really slow on my connection.', 'C’est vraiment lent avec ma connexion.'],
  ['Payments integration', 'Intégration des paiements'],
  [
    'Pay and get paid by card, bank transfer and mobile money.',
    'Payer et être payé par carte, virement et mobile money.',
  ],
  ['Can I pay with mobile money?', 'Je peux payer avec le mobile money ?'],
  ['Fraud checks', 'Contrôles anti-fraude'],
  [
    'Spot suspicious payments before they cost anyone money.',
    'Repérer les paiements suspects avant qu’ils ne coûtent de l’argent à quelqu’un.',
  ],
  [
    'Someone tried to scam me through your app.',
    'Quelqu’un a essayé de m’arnaquer via votre appli.',
  ],
  ['Savings goals', 'Objectifs d’épargne'],
  [
    'Let customers put money aside for something they want.',
    'Permettre aux clients de mettre de l’argent de côté pour un projet.',
  ],
  [
    'I want to save a bit every week for school fees.',
    'Je veux épargner un peu chaque semaine pour les frais de scolarité.',
  ],
  ['Product search', 'Recherche de produits'],
  ['Find any item in two taps.', 'Trouver n’importe quel article en deux touches.'],
  ['I couldn’t find what I was looking for.', 'Je n’ai pas trouvé ce que je cherchais.'],
  ['Recommendations', 'Recommandations'],
  [
    '“You might also like”, based on what people buy.',
    '« Vous aimerez aussi », selon ce que les gens achètent.',
  ],
  [
    'Show me things like what I bought last time.',
    'Montrez-moi des articles comme mon dernier achat.',
  ],
  ['Loyalty rewards', 'Programme de fidélité'],
  ['Points that make regulars stay.', 'Des points qui retiennent les habitués.'],
  [
    'Do I get anything for buying here every week?',
    'J’ai droit à quelque chose si j’achète ici chaque semaine ?',
  ],
  ['Live tracking', 'Suivi en direct'],
  [
    'See where a delivery is on a map, in real time.',
    'Voir où se trouve une livraison sur une carte, en temps réel.',
  ],
  ['Where is my package right now?', 'Où est mon colis en ce moment ?'],
  ['Route optimiser', 'Optimiseur de tournées'],
  [
    'Plan delivery routes that save fuel and time.',
    'Planifier des tournées qui économisent carburant et temps.',
  ],
  [
    'Your riders keep taking the long way round.',
    'Vos livreurs prennent toujours le chemin le plus long.',
  ],
  ['Proof of delivery', 'Preuve de livraison'],
  ['Photo and signature on every drop-off.', 'Photo et signature à chaque livraison.'],
  [
    'The rider says he delivered, but I never got it.',
    'Le livreur dit avoir livré, mais je n’ai rien reçu.',
  ],
  ['Appointment booking', 'Prise de rendez-vous'],
  [
    'Book, move and cancel appointments without calling.',
    'Prendre, déplacer et annuler un rendez-vous sans appeler.',
  ],
  [
    'I spent an hour on the phone trying to book.',
    'J’ai passé une heure au téléphone pour réserver.',
  ],
  ['Video consultations', 'Téléconsultations'],
  ['See a clinician by video from home.', 'Consulter un soignant en vidéo depuis chez soi.'],
  ['Can I talk to someone without travelling?', 'Je peux parler à quelqu’un sans me déplacer ?'],
  ['Secure records', 'Dossiers sécurisés'],
  [
    'Patient records stored safely and shared with consent.',
    'Des dossiers patients stockés en sécurité et partagés avec consentement.',
  ],
  [
    'My doctor couldn’t see my last test results.',
    'Mon médecin n’a pas pu voir mes derniers résultats.',
  ],
  ['Offline mode', 'Mode hors ligne'],
  [
    'Keep working without data; it syncs when you’re back online.',
    'Continuer sans données mobiles ; tout se synchronise au retour du réseau.',
  ],
  ['It stops working when my data runs out.', 'Ça ne marche plus quand je n’ai plus de données.'],
  ['Progress reports', 'Bulletins de progression'],
  [
    'Weekly reports for learners and parents.',
    'Des bilans hebdomadaires pour les élèves et les parents.',
  ],
  [
    'As a parent, I want to see how my child is doing.',
    'En tant que parent, je veux voir comment avance mon enfant.',
  ],
  ['Practice quizzes', 'Quiz d’entraînement'],
  ['Short quizzes that make lessons stick.', 'De courts quiz pour bien retenir les leçons.'],
  ['I want to test myself before the exam.', 'Je veux m’entraîner avant l’examen.'],
  ['Integrations', 'Intégrations'],
  [
    'Connect to the accounting and chat tools customers already use.',
    'Se connecter aux outils de compta et de messagerie que les clients utilisent déjà.',
  ],
  [
    'Does it connect to our accounting software?',
    'Ça se connecte à notre logiciel de comptabilité ?',
  ],
  ['Team accounts', 'Comptes d’équipe'],
  [
    'Several people from one business sharing one account.',
    'Plusieurs personnes d’une même entreprise sur un seul compte.',
  ],
  ['Can my whole team log in?', 'Toute mon équipe peut se connecter ?'],
  ['SMS alerts', 'Alertes SMS'],
  [
    'Text messages that reach farmers on any phone.',
    'Des SMS qui touchent les agriculteurs sur tout téléphone.',
  ],
  [
    'Many of us don’t have smartphones. Can you send texts?',
    'Beaucoup d’entre nous n’ont pas de smartphone. Vous pouvez envoyer des SMS ?',
  ],
  ['Weather and price insights', 'Météo et prix du marché'],
  [
    'Local weather and market prices to plan planting and selling.',
    'Météo locale et prix du marché pour planifier semis et ventes.',
  ],
  ['When is the best time to sell my maize?', 'Quel est le meilleur moment pour vendre mon maïs ?'],
  ['Cooperative accounts', 'Comptes coopératives'],
  ['One account for a whole farmers’ group.', 'Un seul compte pour tout un groupement agricole.'],
  ['Our cooperative wants to sign up together.', 'Notre coopérative veut s’inscrire ensemble.'],
];

/** Feature names only (for the engine's notes and messages). */
const NAMES: [string, string][] = FEATURES.filter((_, i) => i % 3 === 0);

const notes: Record<string, string> = {};
for (const [en, fr] of NAMES) {
  notes[`${en} is ready to release.`] = `${fr} est prêt à être lancé.`;
  notes[`Ship ${en} first.`] = `Lancez d’abord : ${fr}.`;
}

export const roadmap: Record<string, string> = {
  ...Object.fromEntries(FEATURES),
  ...notes,
  // ---- engine messages (inbox, errors)
  'Milestone: First release': 'Étape : premier lancement',
  'That feature doesn’t fit your product.':
    'Cette fonctionnalité ne correspond pas à votre produit.',
  'That feature is already on your roadmap.':
    'Cette fonctionnalité est déjà dans votre feuille de route.',
  'You’ve already shipped that feature.': 'Vous avez déjà lancé cette fonctionnalité.',
  'Your roadmap is full. Ship or remove something first.':
    'Votre feuille de route est pleine. Lancez ou retirez quelque chose d’abord.',
  'That feature isn’t on your roadmap.':
    'Cette fonctionnalité n’est pas dans votre feuille de route.',
  'That feature has shipped.': 'Cette fonctionnalité est déjà lancée.',
  'Already dealt with.': 'Déjà traité.',
  'It’s finished. Release it.': 'C’est terminé. Lancez-le.',
  'Contractors are already on it.': 'Des prestataires y travaillent déjà.',
  'Already released.': 'Déjà lancé.',
  'It isn’t finished yet.': 'Ce n’est pas encore terminé.',
  'The product is frozen while you hibernate.': 'Le produit est gelé pendant l’hibernation.',
  // ---- the screen
  Roadmap: 'Feuille de route',
  'Product roadmap': 'Feuille de route produit',
  'Add a feature': 'Ajouter une fonctionnalité',
  'Add a feature to start.': 'Ajoutez une fonctionnalité pour commencer.',
  'Add (free)': 'Ajouter (gratuit)',
  'Add for {cost}': 'Ajouter pour {cost}',
  'Add {name} to roadmap': 'Ajouter {name} à la feuille de route',
  'About 1 month left': 'Environ 1 mois restant',
  'About {n} months left': 'Environ {n} mois restants',
  Backlog: 'À faire',
  'Being built': 'En construction',
  'Better fit': 'Meilleure adéquation',
  'Higher quality': 'Meilleure qualité',
  'More sign-ups pay': 'Plus d’inscrits paient',
  'Pricing power': 'Pouvoir de prix',
  'Fewer customers leave': 'Moins de départs',
  'Cheaper to run': 'Moins cher à faire tourner',
  'Pays down tech debt': 'Réduit la dette technique',
  'More people find it does what they need.': 'Plus de gens y trouvent ce dont ils ont besoin.',
  'It works better, so it feels more reliable.': 'Ça marche mieux, donc ça paraît plus fiable.',
  'More people who try it become paying customers.':
    'Plus de personnes qui l’essaient deviennent clients payants.',
  'Customers value it more, so your price feels fairer.':
    'Les clients y accordent plus de valeur : votre prix paraît plus juste.',
  'Customers stay longer.': 'Les clients restent plus longtemps.',
  'Each customer costs less to serve.': 'Chaque client coûte moins cher à servir.',
  'Fixes bugs and shortcuts that make the product break.':
    'Corrige les bugs et les raccourcis qui font planter le produit.',
  Engineering: 'Ingénierie',
  Design: 'Design',
  Data: 'Données',
  'High risk': 'Risque élevé',
  'Some risk': 'Un peu risqué',
  'Low risk': 'Risque faible',
  'Contractors finish it at month end': 'Des prestataires le terminent en fin de mois',
  'Contractors hired. It will be finished at month end.':
    'Prestataires engagés. Ce sera terminé en fin de mois.',
  'Customer feedback': 'Retours clients',
  'What customers asked for this month': 'Ce que les clients ont demandé ce mois-ci',
  'Empty.': 'Vide.',
  'Features you can build': 'Fonctionnalités que vous pouvez construire',
  'Hire contractors': 'Engager des prestataires',
  'Pay {fee} to finish by month end': 'Payer {fee} pour finir d’ici la fin du mois',
  'It shipped clean. Customers will notice next month.':
    'Lancement sans bug. Les clients le remarqueront le mois prochain.',
  'It shipped with {n} bugs. Customers will report them.':
    'Lancé avec {n} bugs. Les clients vont les signaler.',
  'Move {name} up': 'Monter {name}',
  'Move {name} down': 'Descendre {name}',
  'Needs {name} first': 'Nécessite d’abord {name}',
  'Next up, in order': 'À venir, dans l’ordre',
  Nice: 'Super',
  'No engineer on the team: data work goes 25% slower.':
    'Aucun ingénieur dans l’équipe : le travail sur les données va 25 % moins vite.',
  'No product designer on the team: this goes 25% slower.':
    'Aucun designer produit dans l’équipe : ça va 25 % moins vite.',
  'No one is building yet. Log build hours on the Product tab or hire engineers.':
    'Personne ne construit encore. Notez des heures de développement dans l’onglet Produit ou recrutez des ingénieurs.',
  'No one is building yet: log build hours or hire engineers':
    'Personne ne construit encore : notez des heures de développement ou recrutez des ingénieurs',
  'Nothing released yet.': 'Rien de lancé pour l’instant.',
  'Nothing started yet. Work begins at month end.':
    'Rien n’a commencé. Le travail démarre en fin de mois.',
  'On your roadmap': 'Dans votre feuille de route',
  'Ready to release': 'Prêt à lancer',
  'Release {name}': 'Lancer {name}',
  'Remove and lose the work done': 'Retirer et perdre le travail fait',
  'Yes, remove it': 'Oui, retirer',
  'Shipped clean.': 'Lancé sans bug.',
  'Shipped with {n} bugs.': 'Lancé avec {n} bugs.',
  Shipped: 'Lancées',
  'The cost is paid now for tools and licences. The work is done by your team.':
    'Le coût est payé maintenant pour les outils et licences. Le travail est fait par votre équipe.',
  'This month: about {n} person-weeks of work.':
    'Ce mois-ci : environ {n} semaines-personne de travail.',
  'Tip: log build hours next month to speed things up.':
    'Astuce : notez des heures de développement le mois prochain pour accélérer.',
  'Waiting for {name} to ship': 'En attente du lancement de {name}',
  'What is tech debt?': 'Qu’est-ce que la dette technique ?',
  '{done} of {total} person-weeks': '{done} sur {total} semaines-personne',
  '{name} added to your roadmap.': '{name} ajouté à votre feuille de route.',
  '{name} is live!': '{name} est en ligne !',
  '{name} is live.': '{name} est en ligne.',
  '{name} progress': 'Avancement de {name}',
  '{n} bugs reached customers. Support tickets are piling up.':
    '{n} bugs ont touché des clients. Les tickets de support s’accumulent.',
  '{n} known bugs are live. They wear quality down every month until a bug bash.':
    '{n} bugs connus sont en ligne. Ils dégradent la qualité chaque mois jusqu’à une chasse aux bugs.',
  '{n} person-weeks': '{n} semaines-personne',
  'Pick features to build. Each month your engineers and your own build hours work on the top one first: {pct}% of their time goes to the roadmap, the rest keeps polishing the product.':
    'Choisissez les fonctionnalités à construire. Chaque mois, vos ingénieurs et vos propres heures de développement travaillent d’abord sur celle du haut : {pct} % de leur temps va à la feuille de route, le reste continue d’améliorer le produit.',
  'Tech debt is the shortcuts in your code. Shipping in Fast mode adds more of them, and a few bugs. Too much tech debt makes the product break, and customers leave.':
    'La dette technique, ce sont les raccourcis dans votre code. Livrer en mode Rapide en ajoute davantage, avec quelques bugs. Trop de dette technique fait planter le produit, et les clients partent.',
  'Quality mode builds slower but ships almost no debt. A bug bash or a security audit pays it down.':
    'Le mode Qualité construit plus lentement mais n’ajoute presque pas de dette. Une chasse aux bugs ou un audit de sécurité la réduit.',
};
