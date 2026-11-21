/** French: branches you can run (Company → Branches, Sales by city, branch customers). */
export const branches: Record<string, string> = {
  // The release note (with the deal-needs note it ships with).
  'Update from your feedback: branches you can run, and customers who say what they need. Company → Branches shows each branch with its customers, revenue, costs and profit, and how to grow it. Give a branch a local marketing budget, hire a local sales rep or a manager, or close it. Sales now finds leads in your branch cities, with a city filter, and when you are in that city you can pitch its businesses in person. Branch customers count in your customer total and show in Customers with their city, and "Sell in a second city" is done once a branch in another city has customers. A discovery meeting in Sales now shows the features a customer needs by name, and which of them you already have. A deal lost because the product doesn’t do what they need names the missing feature, and “Open the Roadmap” takes you straight to it. On the Company screen, “Do it now” on your stage opens the place to work on that step. Refresh to get it; your game is saved.':
    'Mise à jour suite à vos retours : des succursales que vous pouvez gérer, et des clients qui disent ce dont ils ont besoin. Entreprise → Succursales montre chaque succursale avec ses clients, son chiffre d’affaires, ses coûts et son bénéfice, et comment la faire grandir. Donnez à une succursale un budget marketing local, embauchez un commercial local ou un responsable, ou fermez-la. Ventes trouve désormais des prospects dans les villes de vos succursales, avec un filtre par ville, et quand vous êtes dans cette ville vous pouvez démarcher ses commerces en personne. Les clients des succursales comptent dans votre total de clients et apparaissent dans Clients avec leur ville, et « Vendez dans une deuxième ville » est validé dès qu’une succursale dans une autre ville a des clients. Une réunion de découverte dans Ventes montre maintenant par leur nom les fonctionnalités dont un client a besoin, et celles que vous avez déjà. Une affaire perdue parce que le produit ne fait pas ce qu’il leur faut nomme la fonctionnalité manquante, et « Ouvrir la feuille de route » vous y emmène directement. Sur l’écran Entreprise, « Le faire maintenant » sur votre étape ouvre l’endroit où avancer sur cette étape. Actualisez pour l’obtenir ; votre partie est sauvegardée.',

  // Company → Branches.
  'Local sales rep': 'Commercial local',
  'Runs the branch': 'Dirige la succursale',
  'Your branches': 'Vos succursales',
  'No branches yet. Open one below: a branch in another city wins its own customers there, and counts toward “Sell in a second city”.':
    'Pas encore de succursale. Ouvrez-en une ci-dessous : une succursale dans une autre ville y gagne ses propres clients, et compte pour « Vendez dans une deuxième ville ».',
  'Customers at branches': 'Clients des succursales',
  'Branches open': 'Succursales ouvertes',
  'Done: {n} customers in other cities.': 'Fait : {n} clients dans d’autres villes.',
  'Your branch is in your home city. Open one in another city: that is what counts.':
    'Votre succursale est dans votre ville. Ouvrez-en une dans une autre ville : c’est ce qui compte.',
  'Open a branch in another city, then win customers there.':
    'Ouvrez une succursale dans une autre ville, puis gagnez-y des clients.',
  'Branch open. Customers there next: they come at the month end.':
    'Succursale ouverte. Prochaine étape, des clients sur place : ils arrivent en fin de mois.',
  '{district}, {city}': '{district}, {city}',
  'Opened {month}': 'Ouverte en {month}',
  'another city': 'autre ville',
  'Profit {amount}': 'Bénéfice {amount}',
  'Loss {amount}': 'Perte {amount}',
  'First month': 'Premier mois',
  '+{won} / −{lost} last month': '+{won} / −{lost} le mois dernier',
  Costs: 'Coûts',
  'at today’s settings': 'aux réglages actuels',
  'No manager': 'Pas de responsable',
  '{n} reps': '{n} commerciaux',
  '1 sales rep': '1 commercial',
  'plus the shop team in running costs':
    'plus l’équipe en boutique, dans les frais de fonctionnement',
  '{n} signed in Sales from {city}: {amount}/mo': '{n} signés dans Ventes à {city} : {amount}/mois',
  'Manage this branch': 'Gérer cette succursale',
  'Next: give it a local marketing budget. It brings customers in from the first month.':
    'Prochaine étape : donnez-lui un budget marketing local. Il amène des clients dès le premier mois.',
  'Next: hire a local sales rep. More customers, and a lead from {city} in Sales every month.':
    'Prochaine étape : embauchez un commercial local. Plus de clients, et un prospect de {city} dans Ventes chaque mois.',
  'Next: a branch manager reaches further and keeps more customers.':
    'Prochaine étape : un responsable de succursale touche plus de monde et garde plus de clients.',
  'You’re in {city}: pitch its businesses in person below.':
    'Vous êtes à {city} : démarchez ses commerces en personne ci-dessous.',
  'Work its leads in Sales, and visit {city} to pitch businesses in person.':
    'Travaillez ses prospects dans Ventes, et allez à {city} pour démarcher des commerces en personne.',
  Takings: 'Recettes',
  'Rent and shop team': 'Loyer et équipe en boutique',
  'Local marketing': 'Marketing local',
  'Branch staff': 'Personnel de la succursale',
  'It can reach about {n} customers next month at today’s budget and staff. Each one spends about {amount} a month.':
    'Elle peut toucher environ {n} clients le mois prochain avec le budget et le personnel actuels. Chacun dépense environ {amount} par mois.',
  'Budget a month ({currency})': 'Budget par mois ({currency})',
  'Saved.': 'Enregistré.',
  'Set budget': 'Fixer le budget',
  'Up to {max} a month, paid at each month end. More budget brings more customers, though each extra bit brings fewer.':
    'Jusqu’à {max} par mois, payé à chaque fin de mois. Plus de budget amène plus de clients, mais chaque supplément en amène un peu moins.',
  'Only the shop team in its running costs so far.':
    'Pour l’instant, seulement l’équipe en boutique comprise dans ses frais.',
  'Let go ({amount})': 'Licencier ({amount})',
  'Hire a local sales rep ({amount}/mo)': 'Embaucher un commercial local ({amount}/mois)',
  'Hire a manager ({amount}/mo)': 'Embaucher un responsable ({amount}/mois)',
  'A rep reaches about {n} more people and brings a lead from {city} into Sales every month. A manager reaches a quarter more and halves the customers you lose. Hiring takes {h}h; letting someone go costs a month of their pay.':
    'Un commercial touche environ {n} personnes de plus et amène chaque mois un prospect de {city} dans Ventes. Un responsable touche un quart de monde en plus et divise par deux les clients perdus. Embaucher prend {h} h ; licencier coûte un mois de salaire.',
  'Leads in {city}': 'Prospects à {city}',
  '{n} open deals from {city} in Sales.': '{n} affaires en cours à {city} dans Ventes.',
  '1 open deal from {city} in Sales.': '1 affaire en cours à {city} dans Ventes.',
  'No open deals from {city} yet.': 'Pas encore d’affaire en cours à {city}.',
  'New leads.': 'Nouveaux prospects.',
  'Find leads in {city} (4h)': 'Trouver des prospects à {city} (4 h)',
  'See {city} in Sales': 'Voir {city} dans Ventes',
  'Pitch in person': 'Démarcher en personne',
  'No businesses here left to pitch for now.':
    'Plus aucun commerce à démarcher ici pour l’instant.',
  'You’re in {city}. A pitch takes {h}h and puts them in Sales as a warm lead ({n} pitches left this month).':
    'Vous êtes à {city}. Un démarchage prend {h} h et les place dans Ventes comme prospect chaud ({n} démarchages restants ce mois-ci).',
  'Businesses to pitch': 'Commerces à démarcher',
  'Pitched.': 'Démarché.',
  'Visit {city} to pitch its businesses in person: they start as warm leads.':
    'Allez à {city} pour démarcher ses commerces en personne : ils deviennent des prospects chauds.',
  'Book a flight': 'Réserver un vol',
  'Close the branch': 'Fermer la succursale',
  'Closing costs {amount}: a month’s rent breaks the lease, and each person on the staff gets a month’s pay. Its customers stop buying.':
    'Fermer coûte {amount} : un mois de loyer pour rompre le bail, et un mois de salaire pour chaque membre du personnel. Ses clients cessent d’acheter.',
  'Close this branch': 'Fermer cette succursale',
  'Close it ({amount})': 'La fermer ({amount})',
  'How to grow a branch': 'Faire grandir une succursale',
  'Walk-ins find a new branch over its first four months. A better product, reliability and stars bring more of them.':
    'Les clients de passage découvrent une nouvelle succursale pendant ses quatre premiers mois. Un meilleur produit, la fiabilité et les étoiles en amènent davantage.',
  'A local marketing budget brings customers from the first month.':
    'Un budget marketing local amène des clients dès le premier mois.',
  'A local sales rep brings more customers and a lead from that city into Sales every month. Work those leads like any other deal.':
    'Un commercial local amène plus de clients et, chaque mois, un prospect de cette ville dans Ventes. Travaillez ces prospects comme n’importe quelle affaire.',
  'A manager reaches further and keeps more of the customers you win.':
    'Un responsable touche plus de monde et garde plus des clients que vous gagnez.',
  'In Sales, “Find leads” in a branch city finds businesses there. When you visit the city, pitch its businesses in person from here.':
    'Dans Ventes, « Trouver des prospects » dans la ville d’une succursale y trouve des commerces. Quand vous visitez la ville, démarchez ses commerces en personne depuis ici.',
  'Every branch customer counts in your customer total and shows in Customers with its city. A branch in another city with customers completes “Sell in a second city”.':
    'Chaque client de succursale compte dans votre total de clients et apparaît dans Clients avec sa ville. Une succursale dans une autre ville qui a des clients valide « Vendez dans une deuxième ville ».',
  'Manage branches': 'Gérer les succursales',

  // Customers.
  '{n} at branches': '{n} en succursale',
  'Branch customers': 'Clients de succursale',
  '1 customer at the branch': '1 client à la succursale',
  '{n} customers at the branch': '{n} clients à la succursale',
  '{n} at your branches: grow them in Branches':
    '{n} dans vos succursales : faites-les grandir dans Succursales',
  'Branch customers: the people and businesses each branch has won in its city. They pay at every month end; a branch row shows what they all paid last month.':
    'Clients de succursale : les personnes et commerces que chaque succursale a gagnés dans sa ville. Ils paient à chaque fin de mois ; la ligne d’une succursale montre ce qu’ils ont payé au total le mois dernier.',

  // The stage tracker.
  'your branch is in your city': 'votre succursale est dans votre ville',
  'no branch there yet': 'pas encore de succursale là-bas',
  '{n} customers there': '{n} clients là-bas',
  'Open Branches': 'Ouvrir Succursales',

  // Sales by city.
  'All cities': 'Toutes les villes',
  'Find leads in {city}': 'Trouver des prospects à {city}',
  'Businesses in {city}, near your branch. Uses one of this month’s prospecting rounds.':
    'Des commerces à {city}, près de votre succursale. Utilise une des prospections de ce mois.',
};
