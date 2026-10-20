/** The jobs rework: professional employers, ladders, applying, interviews and decisions. */
export const jobsPro: Record<string, string> = {
  // The Jobs app.
  'Level {n} of {of} · {field}': 'Niveau {n} sur {of} · {field}',
  'In this role': 'À ce poste',
  Performance: 'Performance',
  Strong: 'Solide',
  Steady: 'Régulière',
  Slipping: 'En baisse',
  'Go to your promotion interview': 'Aller à votre entretien de promotion',
  'Next: {role}, {pay}/mo': 'Ensuite : {role}, {pay}/mois',
  'You can ask now.': 'Vous pouvez demander maintenant.',
  'Request promotion': 'Demander une promotion',
  'You’re at the top of the ladder.': 'Vous êtes au sommet de l’échelle.',
  Applications: 'Candidatures',
  'Professional jobs': 'Emplois qualifiés',
  'No employers in this city yet.': 'Pas encore d’employeurs dans cette ville.',
  'Part-time jobs': 'Emplois à temps partiel',
  // Fields and skills.
  Consulting: 'Conseil',
  Law: 'Droit',
  'Health care': 'Santé',
  'Service jobs': 'Emplois de service',
  'in finance': 'en finance',
  'in tech': 'dans la tech',
  'in engineering': 'en ingénierie',
  'in consulting': 'en conseil',
  'in law': 'en droit',
  'in health care': 'dans la santé',
  'in service jobs': 'dans les emplois de service',
  // Reasons.
  'Needs {need} months {field} — you have {have}':
    'Il faut {need} mois {field} — vous en avez {have}',
  '{skill} skill {have}, they look for {need}': 'Compétence {skill} à {have}, ils demandent {need}',
  'Needs {need} months in your current role — you have {have}':
    'Il faut {need} mois à votre poste actuel — vous en avez {have}',
  'The interview didn’t convince them: {score}%, they hire from {need}%. Weakest answer: “{question}”':
    'L’entretien ne les a pas convaincus : {score} %, ils recrutent à partir de {need} %. Réponse la plus faible : « {question} »',
  'Good interview — offer: {role}': 'Bon entretien — offre : {role}',
  'Strong interview — offer: {role}': 'Excellent entretien — offre : {role}',
  'You missed the interview.': 'Vous avez manqué l’entretien.',
  // Ladders.
  'Your role': 'Votre poste',
  Eligible: 'Éligible',
  'Needs {n} more months': 'Encore {n} mois',
  'Needs {skill} {n}': 'Il faut {skill} {n}',
  'Go there before the month ends': 'Allez-y avant la fin du mois',
  'Go there this month or next': 'Allez-y ce mois-ci ou le suivant',
  'Interview booked at {place}.': 'Entretien prévu chez {place}.',
  'Roles at {place}': 'Postes chez {place}',
  'Ask for it': 'La demander',
  'Interview booked here.': 'Entretien prévu ici.',
  'They turned you down recently. You can apply again next month.':
    'Ils vous ont refusé récemment. Vous pourrez repostuler le mois prochain.',
  'Applying takes {h}h; you have {left}h left this month.':
    'Postuler prend {h} h ; il vous reste {left} h ce mois-ci.',
  'Applying takes {h}h. The interview is here, in person ({i}h).':
    'Postuler prend {h} h. L’entretien a lieu ici, en personne ({i} h).',
  // The interview and the answer.
  'You got the job at {place}.': 'Vous êtes embauché chez {place}.',
  'Interview at {place}': 'Entretien chez {place}',
  'Promotion interview: {role}': 'Entretien de promotion : {role}',
  'Interview: {role}': 'Entretien : {role}',
  '{place} · about {h}h · answer all three': '{place} · environ {h} h · répondez aux trois',
  'The interview takes {h}h; you have {left}h left':
    'L’entretien prend {h} h ; il vous reste {left} h',
  'Finish the interview': 'Terminer l’entretien',
  Hired: 'Embauché',
  'Promoted: {role}': 'Promu : {role}',
  'Hired: {role}': 'Embauché : {role}',
  'Interview missed: {role}': 'Entretien manqué : {role}',
  'Not this time: {role}': 'Pas cette fois : {role}',
  'Interview booked': 'Entretien prévu',
  'Go to interview': 'Aller à l’entretien',
  'Your experience: {list}': 'Votre expérience : {list}',
  '{field} {n} mo': '{field} {n} mois',
  'No work experience yet: entry roles (level 1) are open to you.':
    'Pas encore d’expérience : les postes débutants (niveau 1) vous sont ouverts.',
  'You learn fast: ×{n} experience.': 'Vous apprenez vite : expérience ×{n}.',
  'Careers at {place}': 'Carrières chez {place}',
  // At the employer.
  'Start the interview': 'Commencer l’entretien',
  '{role} · about {h}h': '{role} · environ {h} h',
  'Careers here: see roles and apply': 'Carrières ici : voir les postes et postuler',
  '{n} roles · {pay}/mo and up': '{n} postes · à partir de {pay}/mois',
  '{n} roles': '{n} postes',

  // From the engine (tx): employers, ladders, their questions.
  'Investment firm': 'Société d’investissement',
  'Tech company': 'Entreprise tech',
  'Engineering firm': 'Bureau d’ingénierie',
  Consultancy: 'Cabinet de conseil',
  'Law firm': 'Cabinet d’avocats',
  Hospital: 'Hôpital',
  'Coffee in the lobby': 'Un café dans le hall',
  'Lunch at the staff café': 'Déjeuner à la cafétéria',
  'Hospital canteen meal': 'Repas à la cantine de l’hôpital',
  'Temp in the back office': 'Intérim au back-office',
  'Market research brief': 'Note d’étude de marché',
  'Test the new app': 'Tester la nouvelle appli',
  'Check technical drawings': 'Vérifier des plans techniques',
  'Make slides for a client': 'Faire des slides pour un client',
  'File court papers': 'Déposer des actes au tribunal',
  'Porter shift': 'Service de brancardier',
  Analyst: 'Analyste',
  Associate: 'Collaborateur',
  'Vice President': 'Vice-président',
  Director: 'Directeur',
  Principal: 'Directeur de participations',
  'Junior developer': 'Développeur junior',
  'Software engineer': 'Ingénieur logiciel',
  'Senior engineer': 'Ingénieur senior',
  'Head of engineering': 'Directeur technique',
  'Graduate engineer': 'Jeune ingénieur',
  'Chief engineer': 'Ingénieur en chef',
  Manager: 'Manager',
  Paralegal: 'Assistant juridique',
  'Senior associate': 'Collaborateur senior',
  Nurse: 'Infirmier',
  Doctor: 'Médecin',
  // Bank.
  'A shop owner wants a loan but has thin records. What do you do?':
    'Un commerçant veut un prêt mais a peu de comptes. Que faites-vous ?',
  'Ask for more collateral before anything else': 'Demander plus de garanties avant tout',
  'Rebuild their cash flow from bank statements': 'Reconstituer sa trésorerie à partir des relevés',
  'Trust your read of the owner': 'Se fier à votre impression du patron',
  'A big client is angry about a fee. How do you handle it?':
    'Un gros client est furieux à cause de frais. Comment gérez-vous ?',
  'Point them to the terms they signed': 'Lui rappeler les conditions signées',
  'Waive it on the spot': 'Les annuler sur-le-champ',
  'Explain it and offer a fair fix': 'Les expliquer et proposer une solution juste',
  'Your model and the client’s numbers disagree. Then?':
    'Votre modèle et les chiffres du client divergent. Ensuite ?',
  'Walk through both line by line until they agree':
    'Tout revoir ligne par ligne jusqu’à ce que ça concorde',
  'Go with the more cautious number': 'Retenir le chiffre le plus prudent',
  'Present both and let the client choose': 'Présenter les deux et laisser le client choisir',
  // Investment firm.
  'A founder pitches a hot market with no revenue yet. Your call?':
    'Un fondateur présente un marché porteur, sans chiffre d’affaires. Votre décision ?',
  'Pass: no revenue, no deal': 'Refuser : pas de revenus, pas d’accord',
  'Size the market and the team before deciding': 'Évaluer le marché et l’équipe avant de décider',
  'Back them before someone else does': 'Investir avant qu’un autre ne le fasse',
  'A portfolio company will run out of cash in four months. What now?':
    'Une participation sera à court de trésorerie dans quatre mois. Et maintenant ?',
  'Cut costs with the founders and plan a bridge':
    'Réduire les coûts avec les fondateurs et prévoir un relais',
  'Write it off and move on': 'La passer en perte et passer à autre chose',
  'Introduce them to other investors': 'Les présenter à d’autres investisseurs',
  'Two funds want the same deal. How do you win it?':
    'Deux fonds veulent le même dossier. Comment l’emporter ?',
  'Offer the highest valuation': 'Proposer la valorisation la plus haute',
  'Show the founder how you’ll help them grow':
    'Montrer au fondateur comment vous l’aiderez à grandir',
  'Agree fair terms quickly and keep your word':
    'Convenir vite de conditions justes et tenir parole',
  // Tech company.
  'The app is down on launch day. First move?':
    'L’appli est en panne le jour du lancement. Premier réflexe ?',
  'Roll back, then find the cause': 'Revenir en arrière, puis trouver la cause',
  'Tell users what is happening': 'Dire aux utilisateurs ce qui se passe',
  'Get the whole team on a call': 'Réunir toute l’équipe en appel',
  'Sales wants a feature by Friday. It needs three weeks. You…':
    'Les ventes veulent une fonction pour vendredi. Il faut trois semaines. Vous…',
  'Say yes and work the weekend': 'Dites oui et travaillez le week-end',
  'Ship the smallest useful version by Friday': 'Livrez la plus petite version utile vendredi',
  'Push back and explain the trade-off': 'Refusez et expliquez le compromis',
  'A teammate’s code keeps breaking the build. What do you do?':
    'Le code d’un collègue casse sans cesse le build. Que faites-vous ?',
  'Fix it quietly yourself': 'Le corriger discrètement vous-même',
  'Pair with them and add tests together': 'Travailler en binôme et ajouter des tests ensemble',
  'Report it to the manager': 'Le signaler au manager',
  // Engineering firm.
  'A site inspection finds a crack in a new beam. What do you do?':
    'Une inspection trouve une fissure dans une poutre neuve. Que faites-vous ?',
  'Stop work and check the load calculations':
    'Arrêter le chantier et vérifier les calculs de charge',
  'Patch it and keep to the schedule': 'Réparer et tenir le planning',
  'Call the client before anything else': 'Appeler le client avant tout',
  'The project is 10% over budget. Your plan?': 'Le projet dépasse le budget de 10 %. Votre plan ?',
  'Find cheaper materials that meet the spec':
    'Trouver des matériaux moins chers conformes au cahier des charges',
  'Ask the client for more money': 'Demander plus d’argent au client',
  'Cut the safety margins': 'Réduire les marges de sécurité',
  'Two crews argue about who goes first on site. You…':
    'Deux équipes se disputent la priorité sur le chantier. Vous…',
  'Let them sort it out': 'Les laissez régler ça',
  'Set a clear schedule and explain why': 'Fixez un planning clair et expliquez pourquoi',
  'Side with the bigger crew': 'Donnez raison à la plus grosse équipe',
  // Consultancy.
  'A retailer’s profits fell 20%. Where do you start?':
    'Les bénéfices d’un distributeur ont chuté de 20 %. Par où commencer ?',
  'Split it into prices, volumes and costs': 'Décomposer en prix, volumes et coûts',
  'Interview the store managers': 'Interroger les gérants de magasin',
  'Suggest a new marketing campaign': 'Proposer une nouvelle campagne marketing',
  'The client’s CEO disagrees with your findings. You…':
    'Le PDG du client conteste vos conclusions. Vous…',
  'Back down to keep the client happy': 'Reculez pour garder le client content',
  'Walk them through the evidence calmly': 'Lui présentez calmement les preuves',
  'Ask your partner to handle it': 'Demandez à votre associé de s’en charger',
  'The deck is due tomorrow and the data is late. What now?':
    'La présentation est pour demain et les données sont en retard. Et maintenant ?',
  'Draft the story now, drop the numbers in later':
    'Écrire le récit maintenant, ajouter les chiffres ensuite',
  'Ask for a day’s extension': 'Demander un jour de plus',
  'Use last year’s figures': 'Utiliser les chiffres de l’an dernier',
  // Law firm.
  'A client wants to sign a contract today. You spot a risky clause.':
    'Un client veut signer un contrat aujourd’hui. Vous repérez une clause risquée.',
  'Flag it and propose safer wording': 'La signaler et proposer une formulation plus sûre',
  'Let them sign: it’s their call': 'Le laisser signer : c’est son choix',
  'Call the other side to renegotiate': 'Appeler l’autre partie pour renégocier',
  'Two business partners are heading to court. Your advice?':
    'Deux associés vont au tribunal. Votre conseil ?',
  'Sue first and hard': 'Attaquer en premier, et fort',
  'Try a settlement before court': 'Tenter un accord avant le procès',
  'Take the press side first': 'Gagner la presse d’abord',
  'A partner asks you to bill hours you didn’t work.':
    'Un associé vous demande de facturer des heures non travaillées.',
  'Refuse and record only real hours': 'Refuser et ne noter que les vraies heures',
  'Do it this once': 'Le faire pour cette fois',
  'Ask HR quietly': 'En parler discrètement aux RH',
  // Hospital.
  'Three patients arrive at once. Who do you see first?':
    'Trois patients arrivent en même temps. Qui voyez-vous en premier ?',
  'Whoever arrived first': 'Le premier arrivé',
  'Check each quickly and treat the most urgent': 'Examiner chacun vite et traiter le plus urgent',
  'Ask a colleague to decide': 'Demander à un collègue de décider',
  'A worried family wants answers you don’t have yet.':
    'Une famille inquiète veut des réponses que vous n’avez pas encore.',
  'Tell them what you know and when you’ll know more':
    'Dire ce que vous savez et quand vous en saurez plus',
  'Say everything will be fine': 'Dire que tout ira bien',
  'Send them to the waiting room': 'Les renvoyer en salle d’attente',
  'Your ward is short-staffed tonight. What do you do?':
    'Votre service manque de personnel ce soir. Que faites-vous ?',
  'Re-plan the rounds and ask for cover': 'Réorganiser les tournées et demander du renfort',
  'Work through without breaks': 'Travailler sans pause',
  'Close beds to new patients': 'Fermer des lits aux nouveaux patients',
};
