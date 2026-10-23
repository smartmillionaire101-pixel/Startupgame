/** French: investor deal flow (pitches at events, investors met, the LP panel's review). */
export const investorDealflow: Record<string, string> = {
  // Events and the event scene
  '{n} founders pitched you: {names}': '{n} fondateurs vous ont pitché : {names}',
  'You talked strategy with {names}': 'Vous avez parlé stratégie avec {names}',
  '{n} new lessons': '{n} nouvelles leçons',
  'Everything is in Portfolio → Pipeline.': 'Tout est dans Portefeuille → Pipeline.',
  'Founders here will pitch you, and you’ll meet other investors.':
    'Ici, des fondateurs vous pitcheront et vous rencontrerez d’autres investisseurs.',
  // The investor journey
  'Meet founders at a tech event or demo day':
    'Rencontrer des fondateurs à un événement tech ou un demo day',
  'Events app: founders pitch investors, and their deals join your pipeline':
    'Appli Événements : les fondateurs pitchent les investisseurs, et leurs dossiers rejoignent votre pipeline',
  'Talk strategy with {n} investors': 'Parler stratégie avec {n} investisseurs',
  'At events, other investors share how they build a fund':
    'Aux événements, d’autres investisseurs expliquent comment ils construisent un fonds',
  // Pitches
  'Referred by {name}': 'Recommandé par {name}',
  'Met at {place}': 'Rencontré à {place}',
  'Pitched you at {event}': 'Vous a pitché à {event}',
  'Co-invest': 'Co-investissement',
  'Human founder': 'Fondateur humain',
  'Revenue {amount}/mo': 'Revenus {amount}/mois',
  '{pct} a month': '{pct} par mois',
  'Raising {ask} on a SAFE capped at {valuation}': 'Lève {ask} en SAFE plafonné à {valuation}',
  'Raising {ask} at {valuation} pre-money': 'Lève {ask} à {valuation} pré-money',
  'Follow-up meeting done: their numbers are open to you.':
    'Second rendez-vous fait : leurs chiffres vous sont ouverts.',
  'Met again ✓': 'Revu ✓',
  'Follow-up meeting (4h)': 'Second rendez-vous (4 h)',
  // Investors met
  'any sector': 'tous secteurs',
  'New lesson': 'Nouvelle leçon',
  'I write {lo}–{hi} cheques from my own money, at {stages}, in {sectors}.':
    'J’investis des tickets de {lo} à {hi} sur mes fonds propres, en {stages}, dans {sectors}.',
  'We write {lo}–{hi} cheques at {stages}, in {sectors}, from a {size} fund.':
    'Nous investissons des tickets de {lo} à {hi} en {stages}, dans {sectors}, depuis un fonds de {size}.',
  'About {n} companies, {reserves} kept for follow-ons, and about {own} ownership at entry.':
    'Environ {n} sociétés, {reserves} gardés pour réinvestir, et environ {own} du capital à l’entrée.',
  '“I’m in {company}, and there’s room for you.” It’s in your pipeline.':
    '« Je suis dans {company}, et il y a de la place pour vous. » C’est dans votre pipeline.',
  '“Meet {company}: not for me, but maybe for you.” It’s in your pipeline.':
    '« Rencontrez {company} : pas pour moi, mais peut-être pour vous. » C’est dans votre pipeline.',
  '{n} founders pitched you': '{n} fondateurs vous ont pitché',
  'Investors you talked strategy with': 'Investisseurs avec qui vous avez parlé stratégie',
  'Met at events': 'Rencontrés aux événements',
  'Founders who pitched you, and deals other investors referred':
    'Les fondateurs qui vous ont pitché, et les dossiers recommandés par d’autres investisseurs',
  'Go to a tech event, a demo day or an investor breakfast (phone → Events): founders will pitch you there.':
    'Allez à un événement tech, un demo day ou un petit-déjeuner d’investisseurs (téléphone → Événements) : des fondateurs vous y pitcheront.',
  'What other investors taught you': 'Ce que d’autres investisseurs vous ont appris',
  '{n} of {total} lessons · investing skill {skill}':
    '{n} leçons sur {total} · compétence en investissement {skill}',
  'Investors at events share how they build a fund. Each new lesson makes you sharper.':
    'Aux événements, les investisseurs expliquent comment ils construisent un fonds. Chaque nouvelle leçon vous affûte.',
  // Strategy checks
  fine: 'ça tient',
  'a stretch': 'tendu',
  'doesn’t add up': 'ne tient pas',
  '{n} companies at your cheque fit the {room} left after fees and reserves.':
    '{n} sociétés à votre ticket tiennent dans les {room} restants après frais et réserves.',
  '{n} companies need {need} for first cheques, but {room} is left after fees and reserves: room for about {fit}.':
    '{n} sociétés demandent {need} de premiers tickets, mais il reste {room} après frais et réserves : de quoi en financer environ {fit}.',
  '{n} companies: enough shots for this stage ({lo}–{hi}).':
    '{n} sociétés : assez de paris pour ce stade ({lo}–{hi}).',
  '{n} companies: LPs expect {lo}–{hi} at this stage.':
    '{n} sociétés : les LP attendent {lo}–{hi} à ce stade.',
  '{pct} kept for follow-ons fits the stage.':
    '{pct} gardés pour réinvestir : cohérent avec le stade.',
  '{pct} kept for follow-ons: {lo}–{hi} is usual at this stage.':
    '{pct} gardés pour réinvestir : {lo}–{hi} est l’usage à ce stade.',
  'Your cheque buys about {implied} at a typical {post} post-money; you aim for {target}.':
    'Votre ticket achète environ {implied} à une valorisation post-money type de {post} ; vous visez {target}.',
  'Your cheque buys about {implied} at a typical {post} post-money, not the {target} you aim for.':
    'Votre ticket achète environ {implied} à une valorisation post-money type de {post}, pas les {target} que vous visez.',
  'A {fee} fee and {carry} carry: market terms.':
    '{fee} de frais et {carry} de carry : conditions de marché.',
  'A {fee} fee and {carry} carry: above market for this fund.':
    '{fee} de frais et {carry} de carry : au-dessus du marché pour ce fonds.',
  'A focused thesis: {n} sectors.': 'Une thèse ciblée : {n} secteurs.',
  '{n} sectors and {s} stages: a broad thesis is a hard sell.':
    '{n} secteurs et {s} stades : une thèse large se vend mal.',
  'The fund size is credible for your record.':
    'La taille du fonds est crédible au vu de votre historique.',
  'The fund is {x}× your last one: LPs find that a stretch.':
    'Le fonds fait {x}× le précédent : les LP trouvent cela tendu.',
  'The fund is {x}× what you have invested so far: LPs find that a stretch.':
    'Le fonds fait {x}× ce que vous avez investi jusqu’ici : les LP trouvent cela tendu.',
  'A geography you can cover.': 'Une zone que vous pouvez couvrir.',
  'LPs doubt a first fund can cover that geography.':
    'Les LP doutent qu’un premier fonds puisse couvrir cette zone.',
  // Questions and answers
  'How do {n} companies fit in this fund?': 'Comment {n} sociétés tiennent-elles dans ce fonds ?',
  'After fees and reserves there is room for about {fit} first cheques.':
    'Après frais et réserves, il y a de quoi faire environ {fit} premiers tickets.',
  'Is {n} companies the right portfolio for this stage?':
    '{n} sociétés, est-ce le bon portefeuille pour ce stade ?',
  'Funds at this stage usually back {lo}–{hi}, so one winner can return the fund.':
    'À ce stade, les fonds soutiennent en général {lo}–{hi} sociétés, pour qu’un gagnant rembourse le fonds.',
  'What happens when your winners raise again?':
    'Que se passe-t-il quand vos gagnants lèvent à nouveau ?',
  'With {pct} in reserve you can follow on; {lo}–{hi} is usual.':
    'Avec {pct} en réserve, vous pouvez réinvestir ; {lo}–{hi} est l’usage.',
  'Can your cheque buy the ownership you want?':
    'Votre ticket peut-il acheter la part que vous visez ?',
  'About {implied} a cheque at today’s prices, against your {target} target.':
    'Environ {implied} par ticket aux prix actuels, contre un objectif de {target}.',
  'Why these fees and carry for this fund?': 'Pourquoi ces frais et ce carry pour ce fonds ?',
  '{fee} and {carry}: most first funds charge 2% and 20%.':
    '{fee} et {carry} : la plupart des premiers fonds prennent 2 % et 20 %.',
  'Why this much money now?': 'Pourquoi autant d’argent maintenant ?',
  'It is {x}× what you have shown so far.': 'C’est {x}× ce que vous avez montré jusqu’ici.',
  'How will you cover that geography?': 'Comment couvrirez-vous cette zone ?',
  'Most first funds stay close to home.': 'La plupart des premiers fonds restent près de chez eux.',
  'Have you returned any cash yet?': 'Avez-vous déjà rendu du cash ?',
  'Not yet: {deals} deals at {tvpi}× on paper.':
    'Pas encore : {deals} investissements à {tvpi}× sur le papier.',
  'What did you learn from your losses?': 'Qu’avez-vous appris de vos pertes ?',
  '{n} companies lost money; LPs want to hear what you changed.':
    '{n} sociétés ont perdu de l’argent ; les LP veulent savoir ce que vous avez changé.',
  'Where does your deal flow come from?': 'D’où vient votre flux de dossiers ?',
  '{n} companies in your pipeline, {e} from events and referrals.':
    '{n} sociétés dans votre pipeline, dont {e} venues d’événements et de recommandations.',
  'Why will you win?': 'Pourquoi allez-vous gagner ?',
  '{deals} deals done; lessons from other investors: {lessons}.':
    '{deals} investissements faits ; leçons d’autres investisseurs : {lessons}.',
  // LP reasons (also the server's words)
  'We only back a manager’s second fund or later.':
    'Nous ne soutenons qu’à partir du deuxième fonds d’un gérant.',
  'We want more deals on your record first.':
    'Nous voulons d’abord plus d’investissements à votre actif.',
  'We back managers with a stronger reputation.':
    'Nous soutenons des gérants à la réputation plus solide.',
  'Your track record is too thin for us yet.': 'Votre historique est encore trop mince pour nous.',
  'Not yet: show us cash returned, not paper gains.':
    'Pas encore : montrez-nous du cash rendu, pas des gains sur le papier.',
  'We need to know you and your team better.':
    'Nous devons mieux vous connaître, vous et votre équipe.',
  'We’re not convinced there are enough companies to back here.':
    'Nous ne sommes pas convaincus qu’il y ait assez de sociétés à soutenir ici.',
  'The maths doesn’t work: your companies and cheques don’t fit the fund after fees and reserves.':
    'Les calculs ne tiennent pas : vos sociétés et vos tickets ne rentrent pas dans le fonds après frais et réserves.',
  'The portfolio is the wrong size for the stage.':
    'Le portefeuille n’a pas la bonne taille pour ce stade.',
  'Your reserves don’t fit the stage: winners will need follow-on money.':
    'Vos réserves ne collent pas au stade : les gagnants auront besoin de réinvestissement.',
  'Your cheque won’t buy the ownership you’re targeting at that stage.':
    'Votre ticket n’achètera pas la part que vous visez à ce stade.',
  'Your fees and carry are above market for this fund.':
    'Vos frais et votre carry sont au-dessus du marché pour ce fonds.',
  'The thesis is too broad for a fund this size.':
    'La thèse est trop large pour un fonds de cette taille.',
  'The fund is too big for what you’ve shown so far.':
    'Le fonds est trop gros pour ce que vous avez montré jusqu’ici.',
  'We doubt you can cover that geography yet.':
    'Nous doutons que vous puissiez déjà couvrir cette zone.',
  'Your track record speaks for itself.': 'Votre historique parle pour vous.',
  'The strategy is coherent and the maths adds up.':
    'La stratégie est cohérente et les calculs tiennent.',
  'We back the team.': 'Nous croyons en l’équipe.',
  'The market is deep and the timing is right.': 'Le marché est profond et le moment est bon.',
  'We back emerging local managers, and your strategy adds up.':
    'Nous soutenons les gérants locaux émergents, et votre stratégie tient.',
  'The strategy doesn’t hang together yet.': 'La stratégie ne tient pas encore debout.',
  // The review
  'Track record': 'Historique',
  'Track record: {deals} deals · TVPI {tvpi}× · DPI {dpi}× · {losses} losses':
    'Historique : {deals} investissements · TVPI {tvpi}× · DPI {dpi}× · {losses} pertes',
  '({realised} realised, {unrealised} unrealised on {invested} invested)':
    '({realised} réalisés, {unrealised} latents pour {invested} investis)',
  'What they asked': 'Leurs questions',
  'Their answers': 'Leurs réponses',
  'Commits {amount}': 'S’engage pour {amount}',
  Passes: 'Passe',
  // The fund pitch
  'This city': 'Cette ville',
  'The country': 'Le pays',
  'The region': 'La région',
  'Average first cheque ({cur})': 'Premier ticket moyen ({cur})',
  'Companies to back': 'Sociétés à soutenir',
  'Ownership target (%)': 'Part visée (%)',
  'Kept for follow-ons': 'Gardé pour réinvestir',
  'How LPs will read it': 'Comment les LP le liront',
  'Pitch Fund I to LPs': 'Présenter le Fonds I aux LP',
  'LPs judge your strategy and your record': 'Les LP jugent votre stratégie et votre historique',
  'Track record: {deals} deals · DPI {dpi}x · {writeOffs} write-offs. LPs want at least 3 angel deals.':
    'Historique : {deals} investissements · DPI {dpi}x · {writeOffs} pertes totales. Les LP veulent au moins 3 investissements de business angel.',
  'LPs in this city can put up to about {amount} into a first fund.':
    'Les LP de cette ville peuvent mettre jusqu’à environ {amount} dans un premier fonds.',
  'Fund size ({cur})': 'Taille du fonds ({cur})',
  'Not enough LPs committed yet: read their answers below.':
    'Pas encore assez d’engagements de LP : lisez leurs réponses ci-dessous.',
  'Pitch the LP panel (15h)': 'Pitcher le panel de LP (15 h)',
  'LPs committed {amount}': 'Les LP se sont engagés pour {amount}',
  'LPs committed {amount} of the {need} a first close needs':
    'Les LP se sont engagés pour {amount} sur les {need} qu’exige un premier closing',
  'Passed: “{why}”': 'A passé : « {why} »',
  'Their questions and answer': 'Leurs questions et leur réponse',
  'Committed {amount}': 'Engagé pour {amount}',
  'Deciding at month end': 'Décision en fin de mois',
  'What your LPs said': 'Ce que vos LP ont dit',
  'Their questions, and why they committed': 'Leurs questions, et pourquoi ils se sont engagés',
  // Lessons (the server's words)
  'Pick a lane you can win in. Founders remember the investor who knew their market cold.':
    'Choisissez un couloir où vous pouvez gagner. Les fondateurs se souviennent de l’investisseur qui connaissait leur marché par cœur.',
  'Keep your thesis to two or three sectors.': 'Limitez votre thèse à deux ou trois secteurs.',
  'Size your cheque to the stake you need, not to what feels comfortable.':
    'Calibrez votre ticket sur la part qu’il vous faut, pas sur ce qui vous met à l’aise.',
  'Work out your cheque from your ownership target and the valuation.':
    'Déduisez votre ticket de votre part visée et de la valorisation.',
  'Seed is a power-law game: one company returns the fund, so you need enough shots on goal.':
    'L’amorçage obéit à une loi de puissance : une société rembourse le fonds, il faut donc assez de paris.',
  'Plan 20 to 40 companies for a seed fund.': 'Prévoyez 20 à 40 sociétés pour un fonds d’amorçage.',
  'I keep about half the fund for follow-ons. The best companies raise again, and that is where the money is made.':
    'Je garde environ la moitié du fonds pour réinvestir. Les meilleures sociétés lèvent à nouveau, et c’est là que se fait l’argent.',
  'Keep 40–60% of a seed fund for follow-ons.':
    'Gardez 40 à 60 % d’un fonds d’amorçage pour réinvestir.',
  'Ownership matters more than price. Two per cent of a winner barely moves a fund; I aim for about ten per cent at entry.':
    'La part compte plus que le prix. Deux pour cent d’un gagnant font à peine bouger un fonds ; je vise environ dix pour cent à l’entrée.',
  'Set an ownership target that fits the stage you invest at.':
    'Fixez une part visée adaptée au stade où vous investissez.',
  'My best deals come from founders I already backed. Help your companies and they send you their friends.':
    'Mes meilleurs dossiers viennent de fondateurs que j’ai déjà soutenus. Aidez vos sociétés et elles vous enverront leurs amis.',
  'Support your portfolio: it becomes your deal flow.':
    'Soutenez votre portefeuille : il devient votre flux de dossiers.',
  'I go to every demo day, but I decide in follow-up meetings, not in the room.':
    'Je vais à tous les demo days, mais je décide lors des seconds rendez-vous, pas dans la salle.',
  'Take follow-up meetings before you send terms.':
    'Prenez un second rendez-vous avant d’envoyer des conditions.',
  'Call customers before the references the founder gave you. Customers don’t rehearse.':
    'Appelez les clients avant les références données par le fondateur. Les clients ne répètent pas.',
  'Do reference calls and check claims before you invest.':
    'Appelez des références et vérifiez les affirmations avant d’investir.',
  'I look for founders who learn fast. What changed in their thinking since we last spoke?':
    'Je cherche des fondateurs qui apprennent vite. Qu’est-ce qui a changé dans leur réflexion depuis notre dernière discussion ?',
  'Meet founders twice before you decide.': 'Rencontrez les fondateurs deux fois avant de décider.',
  'My worst cheque was the one I wrote because everyone else was in. Do your own work.':
    'Mon pire ticket, c’est celui que j’ai signé parce que tout le monde y était. Faites votre propre travail.',
  'Never skip diligence because a round is hot.':
    'Ne sautez jamais l’audit parce qu’un tour est chaud.',
  'Paying up for a hot round is fine once. Doing it every time ruins your returns.':
    'Payer cher un tour chaud, une fois, ça passe. Le faire à chaque fois ruine vos rendements.',
  'Price discipline: walk away when the valuation runs ahead.':
    'Discipline de prix : partez quand la valorisation s’emballe.',
  'LPs want cash back, not paper marks. Think about who could buy each company before you invest.':
    'Les LP veulent du cash, pas des valorisations sur le papier. Pensez à qui pourrait racheter chaque société avant d’investir.',
  'DPI (cash returned) is what LPs judge you on.':
    'Le DPI (le cash rendu) est ce sur quoi les LP vous jugent.',
  'Don’t spend the fund in a year. Pace your deals over the investment period.':
    'Ne dépensez pas le fonds en un an. Étalez vos investissements sur la période d’investissement.',
  'Spread your first cheques over the investment period.':
    'Répartissez vos premiers tickets sur la période d’investissement.',
  'Answer every founder, even with a no. Your reputation is your deal flow.':
    'Répondez à chaque fondateur, même par un non. Votre réputation est votre flux de dossiers.',
  'Pass with a reason within the month: never ghost.':
    'Passez avec une raison dans le mois : ne laissez jamais sans réponse.',
  'When you raise, LPs check the maths: fund size, cheque, number of companies and reserves have to add up.':
    'Quand vous levez, les LP vérifient les calculs : taille du fonds, ticket, nombre de sociétés et réserves doivent tenir.',
  'Fund size ≈ companies × cheque ÷ (1 − reserves), plus fees.':
    'Taille du fonds ≈ sociétés × ticket ÷ (1 − réserves), plus les frais.',
  'A solo founder': 'Fondateur seul',
  // The release note (with the city places note it ships with)
  'Update: the city’s big buildings are real places now. Visit the Chamber of Commerce, the Founders’ Hub or the Stock Exchange; some open only to certain players, and government offices (Tax Office, Central Bank, Embassy and more) see you by appointment. Investors: founders now pitch you at tech events, demo days and investor breakfasts, other investors share how they build a fund, and LPs judge your fund’s strategy and tell you why they commit or pass. Refresh to get it; your game is saved.':
    'Nouveauté : les grands bâtiments de la ville sont désormais de vrais lieux. Visitez la Chambre de commerce, le Founders’ Hub ou la Bourse ; certains n’ouvrent qu’à certains joueurs, et les administrations (centre des impôts, banque centrale, ambassade et autres) vous reçoivent sur rendez-vous. Investisseurs : des fondateurs vous pitchent aux événements tech, demo days et petits-déjeuners d’investisseurs, d’autres investisseurs vous expliquent comment ils construisent un fonds, et les LP jugent la stratégie de votre fonds et vous disent pourquoi ils s’engagent ou passent. Rafraîchissez pour l’obtenir ; votre partie est sauvegardée.',
};
