/**
 * The quiz rooms' built-in question bank (Wave 12). Every quiz is drawn from
 * here by a seeded shuffle (play.ts drawQuiz): nobody writes the questions,
 * everyone plays. Each question has its English and its French, and a
 * category so a quiz mixes them.
 *
 * Row: [category, question, [four answers], correct index, French question,
 * [French answers]]. Proper names stay the same in both languages.
 */

import { MORE_ROWS } from './quiz-more.js';

export type QuizCategory =
  | 'general'
  | 'business'
  | 'tech'
  | 'sport'
  | 'music'
  | 'cities'
  | 'science'
  | 'geography'
  /** Real-life events (FEEDBACK_NOTE): things that happened, with the year in the question. */
  | 'events';

export interface BankQuestion {
  cat: QuizCategory;
  text: string;
  options: string[];
  answer: number;
  fr: { text: string; options: string[] };
}

export type Row = [QuizCategory, string, string[], number, string, string[]];

// prettier-ignore
const ROWS: Row[] = [
  // ---- General knowledge
  ['general', 'How many days are there in a leap year?', ['364', '365', '366', '367'], 2, 'Combien de jours compte une année bissextile ?', ['364', '365', '366', '367']],
  ['general', 'How many minutes are there in a day?', ['1,240', '1,440', '1,640', '2,400'], 1, 'Combien de minutes y a-t-il dans une journée ?', ['1 240', '1 440', '1 640', '2 400']],
  ['general', 'Which colour do you get by mixing blue and yellow?', ['Purple', 'Orange', 'Green', 'Brown'], 2, 'Quelle couleur obtient-on en mélangeant le bleu et le jaune ?', ['Violet', 'Orange', 'Vert', 'Marron']],
  ['general', 'How many sides does a hexagon have?', ['Five', 'Six', 'Seven', 'Eight'], 1, 'Combien de côtés a un hexagone ?', ['Cinq', 'Six', 'Sept', 'Huit']],
  ['general', 'Who wrote Pride and Prejudice?', ['Jane Austen', 'Chinua Achebe', 'Mary Shelley', 'Charles Dickens'], 0, 'Qui a écrit Orgueil et Préjugés ?', ['Jane Austen', 'Chinua Achebe', 'Mary Shelley', 'Charles Dickens']],
  ['general', 'Who wrote Things Fall Apart?', ['Wole Soyinka', 'Chinua Achebe', 'Ngũgĩ wa Thiong’o', 'Ama Ata Aidoo'], 1, 'Qui a écrit Le monde s’effondre (Things Fall Apart) ?', ['Wole Soyinka', 'Chinua Achebe', 'Ngũgĩ wa Thiong’o', 'Ama Ata Aidoo']],
  ['general', 'What is 15% of 200?', ['15', '20', '25', '30'], 3, 'Combien font 15 % de 200 ?', ['15', '20', '25', '30']],
  ['general', 'What is the square root of 144?', ['10', '11', '12', '14'], 2, 'Quelle est la racine carrée de 144 ?', ['10', '11', '12', '14']],
  ['general', 'What is 7 multiplied by 8?', ['54', '56', '58', '64'], 1, 'Combien font 7 fois 8 ?', ['54', '56', '58', '64']],
  ['general', 'How many pieces are on the board at the start of a chess game?', ['16', '24', '32', '36'], 2, 'Combien de pièces y a-t-il sur l’échiquier au début d’une partie ?', ['16', '24', '32', '36']],
  ['general', 'Which shape has three sides?', ['Square', 'Triangle', 'Pentagon', 'Circle'], 1, 'Quelle forme a trois côtés ?', ['Carré', 'Triangle', 'Pentagone', 'Cercle']],
  ['general', 'Who painted the Mona Lisa?', ['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Rembrandt'], 1, 'Qui a peint La Joconde ?', ['Michel-Ange', 'Léonard de Vinci', 'Raphaël', 'Rembrandt']],
  ['general', 'In which country is the Taj Mahal?', ['Pakistan', 'India', 'Nepal', 'Bangladesh'], 1, 'Dans quel pays se trouve le Taj Mahal ?', ['Pakistan', 'Inde', 'Népal', 'Bangladesh']],
  ['general', 'How many continents are there?', ['Five', 'Six', 'Seven', 'Eight'], 2, 'Combien y a-t-il de continents ?', ['Cinq', 'Six', 'Sept', 'Huit']],
  ['general', 'What is the largest mammal?', ['Elephant', 'Blue whale', 'Giraffe', 'Hippopotamus'], 1, 'Quel est le plus grand mammifère ?', ['L’éléphant', 'La baleine bleue', 'La girafe', 'L’hippopotame']],
  ['general', 'What is the fastest land animal?', ['Lion', 'Cheetah', 'Antelope', 'Horse'], 1, 'Quel est l’animal terrestre le plus rapide ?', ['Le lion', 'Le guépard', 'L’antilope', 'Le cheval']],
  ['general', 'How many hours are there in a week?', ['148', '158', '168', '178'], 2, 'Combien d’heures y a-t-il dans une semaine ?', ['148', '158', '168', '178']],
  ['general', 'Which language has the most native speakers?', ['English', 'Spanish', 'Mandarin Chinese', 'Hindi'], 2, 'Quelle langue compte le plus de locuteurs natifs ?', ['L’anglais', 'L’espagnol', 'Le chinois mandarin', 'L’hindi']],
  ['general', 'Which is the smallest prime number?', ['0', '1', '2', '3'], 2, 'Quel est le plus petit nombre premier ?', ['0', '1', '2', '3']],
  ['general', 'What do bees make?', ['Milk', 'Honey', 'Silk', 'Wax only'], 1, 'Que fabriquent les abeilles ?', ['Du lait', 'Du miel', 'De la soie', 'Seulement de la cire']],
  ['general', 'Who was the first person to walk on the Moon?', ['Buzz Aldrin', 'Yuri Gagarin', 'Neil Armstrong', 'John Glenn'], 2, 'Qui a marché le premier sur la Lune ?', ['Buzz Aldrin', 'Youri Gagarine', 'Neil Armstrong', 'John Glenn']],
  ['general', 'In which year did the Second World War end?', ['1918', '1939', '1945', '1950'], 2, 'En quelle année la Seconde Guerre mondiale s’est-elle terminée ?', ['1918', '1939', '1945', '1950']],
  ['general', 'Who became South Africa’s president in 1994?', ['Thabo Mbeki', 'Nelson Mandela', 'Desmond Tutu', 'Jacob Zuma'], 1, 'Qui est devenu président de l’Afrique du Sud en 1994 ?', ['Thabo Mbeki', 'Nelson Mandela', 'Desmond Tutu', 'Jacob Zuma']],
  ['general', 'Which country became independent in 1957, led by Kwame Nkrumah?', ['Nigeria', 'Kenya', 'Ghana', 'Senegal'], 2, 'Quel pays est devenu indépendant en 1957, sous la conduite de Kwame Nkrumah ?', ['Le Nigeria', 'Le Kenya', 'Le Ghana', 'Le Sénégal']],
  ['general', 'How many strings does a standard violin have?', ['Three', 'Four', 'Five', 'Six'], 1, 'Combien de cordes a un violon standard ?', ['Trois', 'Quatre', 'Cinq', 'Six']],
  ['general', 'What is the freezing point of water in degrees Celsius?', ['-10', '0', '4', '32'], 1, 'À combien de degrés Celsius l’eau gèle-t-elle ?', ['-10', '0', '4', '32']],
  ['general', 'Which is the longest river in the world by most measures?', ['Amazon', 'Nile', 'Yangtze', 'Congo'], 1, 'Quel est le plus long fleuve du monde selon la plupart des mesures ?', ['L’Amazone', 'Le Nil', 'Le Yangtsé', 'Le Congo']],
  ['general', 'What is the hardest natural substance?', ['Gold', 'Iron', 'Diamond', 'Quartz'], 2, 'Quelle est la substance naturelle la plus dure ?', ['L’or', 'Le fer', 'Le diamant', 'Le quartz']],
  ['general', 'Which planet is known as the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Saturn'], 1, 'Quelle planète surnomme-t-on la planète rouge ?', ['Vénus', 'Mars', 'Jupiter', 'Saturne']],
  ['general', 'How many zeros are there in one million?', ['Five', 'Six', 'Seven', 'Nine'], 1, 'Combien de zéros compte un million ?', ['Cinq', 'Six', 'Sept', 'Neuf']],

  // ---- Business and money
  ['business', 'What does a balance sheet show?', ['Only sales', 'Assets, liabilities and equity', 'Only cash payments', 'Advertising reach'], 1, 'Que montre un bilan ?', ['Seulement les ventes', 'L’actif, le passif et les capitaux propres', 'Seulement les paiements en espèces', 'La portée publicitaire']],
  ['business', 'What does revenue minus expenses give you?', ['Profit or loss', 'Market share', 'Headcount', 'Inventory'], 0, 'Que donne le chiffre d’affaires moins les dépenses ?', ['Le bénéfice ou la perte', 'La part de marché', 'L’effectif', 'Le stock']],
  ['business', 'What is an investor buying when they buy equity?', ['Ownership', 'A tax refund', 'A guaranteed salary', 'A licence'], 0, 'Qu’achète un investisseur quand il achète des actions ?', ['Une part de propriété', 'Un remboursement d’impôt', 'Un salaire garanti', 'Une licence']],
  ['business', 'What is a mortgage secured against?', ['A property', 'A passport', 'A company name', 'A phone number'], 0, 'Sur quoi un prêt immobilier est-il garanti ?', ['Un bien immobilier', 'Un passeport', 'Un nom d’entreprise', 'Un numéro de téléphone']],
  ['business', 'What does “burn rate” measure for a startup?', ['How fast it spends cash', 'Its server temperature', 'Its staff turnover', 'Its share price'], 0, 'Que mesure le « burn rate » d’une startup ?', ['La vitesse à laquelle elle dépense sa trésorerie', 'La température de ses serveurs', 'La rotation de son personnel', 'Le cours de son action']],
  ['business', 'What is a startup valued at $1 billion or more often called?', ['A unicorn', 'A dragon', 'A pegasus', 'A phoenix'], 0, 'Comment appelle-t-on souvent une startup valorisée à un milliard de dollars ou plus ?', ['Une licorne', 'Un dragon', 'Un pégase', 'Un phénix']],
  ['business', 'What does IPO stand for?', ['Initial public offering', 'International profit order', 'Internal price option', 'Investor payout obligation'], 0, 'Que signifie IPO (en anglais) ?', ['Introduction en bourse', 'Ordre de profit international', 'Option de prix interne', 'Obligation de paiement aux investisseurs']],
  ['business', 'What is “runway” for a startup?', ['Months of cash left at the current spend', 'Its office corridor', 'Its marketing plan', 'Its list of investors'], 0, 'Qu’est-ce que la « runway » d’une startup ?', ['Les mois de trésorerie restants au rythme actuel', 'Le couloir de ses bureaux', 'Son plan marketing', 'Sa liste d’investisseurs']],
  ['business', 'Interest charged on both the original sum and earlier interest is called…', ['Simple interest', 'Compound interest', 'Flat interest', 'Negative interest'], 1, 'Les intérêts calculés sur le capital et sur les intérêts déjà acquis s’appellent…', ['Intérêts simples', 'Intérêts composés', 'Intérêts fixes', 'Intérêts négatifs']],
  ['business', 'What does “B2B” mean?', ['Business to business', 'Back to basics', 'Bank to bank', 'Buy to borrow'], 0, 'Que signifie « B2B » ?', ['D’entreprise à entreprise', 'Retour aux bases', 'De banque à banque', 'Acheter pour emprunter']],
  ['business', 'Who founded Microsoft with Paul Allen?', ['Steve Jobs', 'Bill Gates', 'Larry Page', 'Jeff Bezos'], 1, 'Qui a fondé Microsoft avec Paul Allen ?', ['Steve Jobs', 'Bill Gates', 'Larry Page', 'Jeff Bezos']],
  ['business', 'Which company started as an online bookshop?', ['eBay', 'Amazon', 'Alibaba', 'Netflix'], 1, 'Quelle entreprise a commencé comme librairie en ligne ?', ['eBay', 'Amazon', 'Alibaba', 'Netflix']],
  ['business', 'M-Pesa, the mobile money service, was launched in which country?', ['Nigeria', 'Kenya', 'Ghana', 'Rwanda'], 1, 'M-Pesa, le service de paiement mobile, a été lancé dans quel pays ?', ['Le Nigeria', 'Le Kenya', 'Le Ghana', 'Le Rwanda']],
  ['business', 'What is inflation?', ['A general rise in prices', 'A fall in unemployment', 'A rise in exports', 'A tax on imports'], 0, 'Qu’est-ce que l’inflation ?', ['Une hausse générale des prix', 'Une baisse du chômage', 'Une hausse des exportations', 'Une taxe sur les importations']],
  ['business', 'What is the currency of the United Kingdom?', ['Euro', 'Pound sterling', 'Dollar', 'Franc'], 1, 'Quelle est la monnaie du Royaume-Uni ?', ['L’euro', 'La livre sterling', 'Le dollar', 'Le franc']],
  ['business', 'What is the currency of Nigeria?', ['Cedi', 'Naira', 'Rand', 'Shilling'], 1, 'Quelle est la monnaie du Nigeria ?', ['Le cedi', 'Le naira', 'Le rand', 'Le shilling']],
  ['business', 'What is the currency of Ghana?', ['Cedi', 'Naira', 'Leone', 'Dirham'], 0, 'Quelle est la monnaie du Ghana ?', ['Le cedi', 'Le naira', 'Le leone', 'Le dirham']],
  ['business', 'What is the currency of South Africa?', ['Rand', 'Pula', 'Kwacha', 'Shilling'], 0, 'Quelle est la monnaie de l’Afrique du Sud ?', ['Le rand', 'Le pula', 'Le kwacha', 'Le shilling']],
  ['business', 'What is the currency of the United Arab Emirates?', ['Riyal', 'Dinar', 'Dirham', 'Pound'], 2, 'Quelle est la monnaie des Émirats arabes unis ?', ['Le riyal', 'Le dinar', 'Le dirham', 'La livre']],
  ['business', 'What is the currency of Sierra Leone?', ['Leone', 'Franc', 'Cedi', 'Dalasi'], 0, 'Quelle est la monnaie de la Sierra Leone ?', ['Le leone', 'Le franc', 'Le cedi', 'Le dalasi']],
  ['business', 'A company’s total sales over a period is called its…', ['Revenue', 'Equity', 'Dividend', 'Collateral'], 0, 'Le total des ventes d’une entreprise sur une période s’appelle…', ['Le chiffre d’affaires', 'Les capitaux propres', 'Le dividende', 'La garantie']],
  ['business', 'A share of profits paid to shareholders is a…', ['Bonus', 'Dividend', 'Coupon', 'Premium'], 1, 'Une part des bénéfices versée aux actionnaires est…', ['Une prime', 'Un dividende', 'Un coupon', 'Une surprime']],
  ['business', 'What does a venture capital fund mainly invest in?', ['Government bonds', 'Young, fast-growing companies', 'Gold', 'Farmland'], 1, 'Dans quoi un fonds de capital-risque investit-il surtout ?', ['Des obligations d’État', 'De jeunes entreprises à forte croissance', 'De l’or', 'Des terres agricoles']],
  ['business', 'Which economic term describes two quarters of falling output in a row, as commonly defined?', ['Boom', 'Recession', 'Inflation', 'Surplus'], 1, 'Quel terme décrit couramment deux trimestres consécutifs de baisse de la production ?', ['Un boom', 'Une récession', 'L’inflation', 'Un excédent']],
  ['business', 'What does CEO stand for?', ['Chief executive officer', 'Central earnings officer', 'Chief equity owner', 'Company enterprise operator'], 0, 'Que signifie CEO ?', ['Directeur général', 'Responsable des revenus centraux', 'Propriétaire principal des actions', 'Opérateur d’entreprise']],
  ['business', 'Who founded the Dangote Group?', ['Mike Adenuga', 'Aliko Dangote', 'Tony Elumelu', 'Femi Otedola'], 1, 'Qui a fondé le groupe Dangote ?', ['Mike Adenuga', 'Aliko Dangote', 'Tony Elumelu', 'Femi Otedola']],
  ['business', 'What is “market share”?', ['A company’s portion of a market’s sales', 'A stall in a market', 'A type of bond', 'A shareholder meeting'], 0, 'Qu’est-ce que la « part de marché » ?', ['La part des ventes d’un marché réalisée par une entreprise', 'Un étal au marché', 'Un type d’obligation', 'Une assemblée d’actionnaires']],
  ['business', 'A loan that must be repaid with interest is a form of…', ['Equity', 'Debt', 'Grant', 'Donation'], 1, 'Un prêt à rembourser avec intérêts est une forme de…', ['Fonds propres', 'Dette', 'Subvention', 'Don']],

  // ---- Technology
  ['tech', 'What does “www” stand for in a web address?', ['World Wide Web', 'Wide Web World', 'Web World Wide', 'World Web Window'], 0, 'Que signifie « www » dans une adresse web ?', ['World Wide Web', 'Wide Web World', 'Web World Wide', 'World Web Window']],
  ['tech', 'Who is credited with inventing the World Wide Web?', ['Bill Gates', 'Tim Berners-Lee', 'Steve Wozniak', 'Alan Turing'], 1, 'À qui attribue-t-on l’invention du World Wide Web ?', ['Bill Gates', 'Tim Berners-Lee', 'Steve Wozniak', 'Alan Turing']],
  ['tech', 'What does CPU stand for?', ['Central processing unit', 'Computer power unit', 'Core program utility', 'Central print unit'], 0, 'Que signifie CPU ?', ['Unité centrale de traitement', 'Unité d’alimentation', 'Utilitaire de programme', 'Unité d’impression']],
  ['tech', 'How many bits are in a byte?', ['Four', 'Eight', 'Sixteen', 'Thirty-two'], 1, 'Combien de bits y a-t-il dans un octet ?', ['Quatre', 'Huit', 'Seize', 'Trente-deux']],
  ['tech', 'Which company makes the iPhone?', ['Samsung', 'Apple', 'Google', 'Huawei'], 1, 'Quelle entreprise fabrique l’iPhone ?', ['Samsung', 'Apple', 'Google', 'Huawei']],
  ['tech', 'Android is an operating system developed mainly by…', ['Apple', 'Microsoft', 'Google', 'Nokia'], 2, 'Android est un système d’exploitation développé principalement par…', ['Apple', 'Microsoft', 'Google', 'Nokia']],
  ['tech', 'What does “AI” stand for?', ['Automatic input', 'Artificial intelligence', 'Applied internet', 'Advanced interface'], 1, 'Que signifie « IA » ?', ['Entrée automatique', 'Intelligence artificielle', 'Internet appliqué', 'Interface avancée']],
  ['tech', 'Which of these is a programming language?', ['Python', 'Cobra', 'Viper', 'Mamba'], 0, 'Lequel de ces noms est un langage de programmation ?', ['Python', 'Cobra', 'Viper', 'Mamba']],
  ['tech', 'What does a URL identify?', ['A web address', 'A battery type', 'A screen size', 'A chip maker'], 0, 'Qu’identifie une URL ?', ['Une adresse web', 'Un type de batterie', 'Une taille d’écran', 'Un fabricant de puces']],
  ['tech', 'What is the “cloud” in cloud computing?', ['Servers reached over the internet', 'A weather satellite', 'A type of screen', 'A cable under the sea'], 0, 'Qu’est-ce que le « cloud » en informatique ?', ['Des serveurs accessibles par internet', 'Un satellite météo', 'Un type d’écran', 'Un câble sous-marin']],
  ['tech', 'Which company was founded in a Silicon Valley garage by Bill Hewlett and David Packard?', ['IBM', 'HP', 'Intel', 'Oracle'], 1, 'Quelle entreprise a été fondée dans un garage de la Silicon Valley par Bill Hewlett et David Packard ?', ['IBM', 'HP', 'Intel', 'Oracle']],
  ['tech', 'What does “GPS” help you find?', ['Your location', 'Your password', 'Your blood type', 'Your bank balance'], 0, 'À quoi sert le « GPS » ?', ['À trouver sa position', 'À trouver son mot de passe', 'À connaître son groupe sanguin', 'À voir son solde bancaire']],
  ['tech', 'What does “Wi-Fi” let devices do?', ['Connect wirelessly to a network', 'Charge without a cable', 'Print in colour', 'Play music louder'], 0, 'Que permet le « Wi-Fi » aux appareils ?', ['Se connecter sans fil à un réseau', 'Se charger sans câble', 'Imprimer en couleur', 'Jouer la musique plus fort']],
  ['tech', 'In computing, what is RAM?', ['Short-term working memory', 'A type of keyboard', 'A network cable', 'A screen coating'], 0, 'En informatique, qu’est-ce que la RAM ?', ['La mémoire de travail à court terme', 'Un type de clavier', 'Un câble réseau', 'Un revêtement d’écran']],
  ['tech', 'Which company created the Windows operating system?', ['Apple', 'Microsoft', 'IBM', 'Linux'], 1, 'Quelle entreprise a créé le système d’exploitation Windows ?', ['Apple', 'Microsoft', 'IBM', 'Linux']],
  ['tech', 'What is open-source software?', ['Software whose code anyone may read and change', 'Software that is always free of bugs', 'Software sold only in shops', 'Software without a licence'], 0, 'Qu’est-ce qu’un logiciel libre (open source) ?', ['Un logiciel dont chacun peut lire et modifier le code', 'Un logiciel toujours sans bug', 'Un logiciel vendu seulement en magasin', 'Un logiciel sans licence']],
  ['tech', 'Which tech company is headquartered in Cupertino, California?', ['Google', 'Apple', 'Meta', 'Netflix'], 1, 'Quelle entreprise tech a son siège à Cupertino, en Californie ?', ['Google', 'Apple', 'Meta', 'Netflix']],
  ['tech', 'What was Facebook’s parent company renamed in 2021?', ['Alphabet', 'Meta', 'X', 'Horizon'], 1, 'Comment la société mère de Facebook a-t-elle été renommée en 2021 ?', ['Alphabet', 'Meta', 'X', 'Horizon']],
  ['tech', 'What does “HTML” describe?', ['The structure of web pages', 'A computer virus', 'A phone network', 'A file compressor'], 0, 'Que décrit le « HTML » ?', ['La structure des pages web', 'Un virus informatique', 'Un réseau téléphonique', 'Un compresseur de fichiers']],
  ['tech', 'Two-factor authentication adds…', ['A second check when you sign in', 'A second screen', 'Twice the storage', 'A backup battery'], 0, 'L’authentification à deux facteurs ajoute…', ['Une seconde vérification à la connexion', 'Un second écran', 'Le double de stockage', 'Une batterie de secours']],
  ['tech', 'Which company owns YouTube?', ['Meta', 'Google', 'Amazon', 'Microsoft'], 1, 'Quelle entreprise possède YouTube ?', ['Meta', 'Google', 'Amazon', 'Microsoft']],
  ['tech', 'What is a “bug” in software?', ['An error in the code', 'A new feature', 'A type of virus scanner', 'A fast processor'], 0, 'Qu’est-ce qu’un « bug » dans un logiciel ?', ['Une erreur dans le code', 'Une nouvelle fonctionnalité', 'Un antivirus', 'Un processeur rapide']],
  ['tech', 'Which unit measures a computer’s storage?', ['Hertz', 'Gigabyte', 'Watt', 'Lumen'], 1, 'Quelle unité mesure le stockage d’un ordinateur ?', ['Le hertz', 'Le gigaoctet', 'Le watt', 'Le lumen']],
  ['tech', 'What is phishing?', ['Tricking people into giving away details', 'A way to cool servers', 'A fishing app', 'A screen setting'], 0, 'Qu’est-ce que l’hameçonnage (phishing) ?', ['Piéger des gens pour obtenir leurs informations', 'Une façon de refroidir les serveurs', 'Une appli de pêche', 'Un réglage d’écran']],

  // ---- Sport
  ['sport', 'In football, how many players start on one team?', ['Nine', 'Ten', 'Eleven', 'Twelve'], 2, 'Au football, combien de joueurs commencent dans une équipe ?', ['Neuf', 'Dix', 'Onze', 'Douze']],
  ['sport', 'How many points is the black ball worth in snooker?', ['Four', 'Five', 'Six', 'Seven'], 3, 'Combien de points vaut la bille noire au snooker ?', ['Quatre', 'Cinq', 'Six', 'Sept']],
  ['sport', 'How many points is a red ball worth in snooker?', ['One', 'Two', 'Three', 'Five'], 0, 'Combien de points vaut une bille rouge au snooker ?', ['Un', 'Deux', 'Trois', 'Cinq']],
  ['sport', 'How often is the FIFA World Cup usually held?', ['Every two years', 'Every three years', 'Every four years', 'Every five years'], 2, 'À quelle fréquence la Coupe du monde de la FIFA a-t-elle lieu en général ?', ['Tous les deux ans', 'Tous les trois ans', 'Tous les quatre ans', 'Tous les cinq ans']],
  ['sport', 'How long is a marathon, roughly?', ['21 km', '30 km', '42 km', '50 km'], 2, 'Quelle est la longueur approximative d’un marathon ?', ['21 km', '30 km', '42 km', '50 km']],
  ['sport', 'In which sport would you perform a slam dunk?', ['Volleyball', 'Basketball', 'Tennis', 'Rugby'], 1, 'Dans quel sport réalise-t-on un smash dunk ?', ['Le volley-ball', 'Le basket-ball', 'Le tennis', 'Le rugby']],
  ['sport', 'How many rings are on the Olympic flag?', ['Four', 'Five', 'Six', 'Seven'], 1, 'Combien d’anneaux figurent sur le drapeau olympique ?', ['Quatre', 'Cinq', 'Six', 'Sept']],
  ['sport', 'Which country has won the most FIFA men’s World Cups?', ['Germany', 'Italy', 'Brazil', 'Argentina'], 2, 'Quel pays a remporté le plus de Coupes du monde masculines de la FIFA ?', ['L’Allemagne', 'L’Italie', 'Le Brésil', 'L’Argentine']],
  ['sport', 'Wimbledon is a famous tournament in which sport?', ['Golf', 'Tennis', 'Cricket', 'Rowing'], 1, 'Wimbledon est un célèbre tournoi de quel sport ?', ['Le golf', 'Le tennis', 'Le cricket', 'L’aviron']],
  ['sport', 'Kenya is especially famous for champions in which sport?', ['Swimming', 'Long-distance running', 'Ice hockey', 'Cycling'], 1, 'Le Kenya est surtout célèbre pour ses champions de quel sport ?', ['La natation', 'La course de fond', 'Le hockey sur glace', 'Le cyclisme']],
  ['sport', 'Who holds the men’s 100 metres world record (9.58 s)?', ['Carl Lewis', 'Usain Bolt', 'Yohan Blake', 'Tyson Gay'], 1, 'Qui détient le record du monde masculin du 100 mètres (9,58 s) ?', ['Carl Lewis', 'Usain Bolt', 'Yohan Blake', 'Tyson Gay']],
  ['sport', 'How many players are on a basketball team on court?', ['Four', 'Five', 'Six', 'Seven'], 1, 'Combien de joueurs d’une équipe de basket sont sur le terrain ?', ['Quatre', 'Cinq', 'Six', 'Sept']],
  ['sport', 'In tennis, what is a score of zero called?', ['Nil', 'Love', 'Duck', 'Blank'], 1, 'Au tennis, comment appelle-t-on un score de zéro en anglais ?', ['Nil', 'Love', 'Duck', 'Blank']],
  ['sport', 'Which country hosted the 2010 FIFA World Cup?', ['Nigeria', 'Egypt', 'South Africa', 'Morocco'], 2, 'Quel pays a accueilli la Coupe du monde 2010 ?', ['Le Nigeria', 'L’Égypte', 'L’Afrique du Sud', 'Le Maroc']],
  ['sport', 'Which national team are known as the Super Eagles?', ['Ghana', 'Nigeria', 'Senegal', 'Cameroon'], 1, 'Quelle équipe nationale surnomme-t-on les Super Eagles ?', ['Le Ghana', 'Le Nigeria', 'Le Sénégal', 'Le Cameroun']],
  ['sport', 'Which national team are known as the Black Stars?', ['Ghana', 'Kenya', 'Zambia', 'Ivory Coast'], 0, 'Quelle équipe nationale surnomme-t-on les Black Stars ?', ['Le Ghana', 'Le Kenya', 'La Zambie', 'La Côte d’Ivoire']],
  ['sport', 'Which national football team are known as the Pharaohs?', ['Sudan', 'Egypt', 'Tunisia', 'Libya'], 1, 'Quelle équipe nationale de football surnomme-t-on les Pharaons ?', ['Le Soudan', 'L’Égypte', 'La Tunisie', 'La Libye']],
  ['sport', 'How many holes are played in a standard round of golf?', ['Nine', 'Twelve', 'Eighteen', 'Twenty-one'], 2, 'Combien de trous compte un parcours de golf standard ?', ['Neuf', 'Douze', 'Dix-huit', 'Vingt et un']],
  ['sport', 'In cricket, how many balls are in a standard over?', ['Four', 'Five', 'Six', 'Eight'], 2, 'Au cricket, combien de balles compte un over standard ?', ['Quatre', 'Cinq', 'Six', 'Huit']],
  ['sport', 'Which sport uses a shuttlecock?', ['Squash', 'Badminton', 'Table tennis', 'Lacrosse'], 1, 'Quel sport utilise un volant ?', ['Le squash', 'Le badminton', 'Le tennis de table', 'La crosse']],
  ['sport', 'How long is a standard football match, not counting added time?', ['60 minutes', '80 minutes', '90 minutes', '100 minutes'], 2, 'Combien de temps dure un match de football standard, hors temps additionnel ?', ['60 minutes', '80 minutes', '90 minutes', '100 minutes']],
  ['sport', 'Mohamed Salah plays for which national team?', ['Morocco', 'Egypt', 'Algeria', 'Tunisia'], 1, 'Mohamed Salah joue pour quelle équipe nationale ?', ['Le Maroc', 'L’Égypte', 'L’Algérie', 'La Tunisie']],
  ['sport', 'The Springboks are South Africa’s national team in which sport?', ['Football', 'Cricket', 'Rugby union', 'Hockey'], 2, 'Les Springboks sont l’équipe nationale sud-africaine de quel sport ?', ['Le football', 'Le cricket', 'Le rugby à XV', 'Le hockey']],
  ['sport', 'In which city were the 2012 Summer Olympics held?', ['Beijing', 'London', 'Rio de Janeiro', 'Tokyo'], 1, 'Dans quelle ville se sont tenus les Jeux olympiques d’été de 2012 ?', ['Pékin', 'Londres', 'Rio de Janeiro', 'Tokyo']],
  ['sport', 'What is the maximum break in snooker (without free balls)?', ['100', '147', '155', '180'], 1, 'Quel est le break maximum au snooker (sans bille libre) ?', ['100', '147', '155', '180']],

  // ---- Music
  ['music', 'Which instrument has keys, pedals and strings?', ['Trumpet', 'Piano', 'Flute', 'Drum'], 1, 'Quel instrument a des touches, des pédales et des cordes ?', ['La trompette', 'Le piano', 'La flûte', 'Le tambour']],
  ['music', 'Fela Kuti is known as the pioneer of which genre?', ['Highlife', 'Afrobeat', 'Reggae', 'Soukous'], 1, 'Fela Kuti est connu comme le pionnier de quel genre ?', ['Le highlife', 'L’afrobeat', 'Le reggae', 'Le soukous']],
  ['music', 'Bob Marley is most associated with which genre?', ['Jazz', 'Reggae', 'Blues', 'Rock'], 1, 'À quel genre associe-t-on surtout Bob Marley ?', ['Le jazz', 'Le reggae', 'Le blues', 'Le rock']],
  ['music', 'Which band recorded “Hey Jude”?', ['The Rolling Stones', 'The Beatles', 'Queen', 'ABBA'], 1, 'Quel groupe a enregistré « Hey Jude » ?', ['The Rolling Stones', 'The Beatles', 'Queen', 'ABBA']],
  ['music', 'How many keys does a standard modern piano have?', ['66', '76', '88', '96'], 2, 'Combien de touches compte un piano moderne standard ?', ['66', '76', '88', '96']],
  ['music', 'Amapiano music originated in which country?', ['Nigeria', 'South Africa', 'Kenya', 'Ghana'], 1, 'La musique amapiano est née dans quel pays ?', ['Le Nigeria', 'L’Afrique du Sud', 'Le Kenya', 'Le Ghana']],
  ['music', 'Which singer is known as the “Queen of Pop”?', ['Beyoncé', 'Madonna', 'Rihanna', 'Adele'], 1, 'Quelle chanteuse surnomme-t-on la « reine de la pop » ?', ['Beyoncé', 'Madonna', 'Rihanna', 'Adele']],
  ['music', 'Which singer is known as the “King of Pop”?', ['Elvis Presley', 'Michael Jackson', 'Prince', 'Stevie Wonder'], 1, 'Quel chanteur surnomme-t-on le « roi de la pop » ?', ['Elvis Presley', 'Michael Jackson', 'Prince', 'Stevie Wonder']],
  ['music', 'Highlife music is most closely linked with which country?', ['Ghana', 'Egypt', 'Rwanda', 'Kenya'], 0, 'À quel pays la musique highlife est-elle surtout liée ?', ['Le Ghana', 'L’Égypte', 'Le Rwanda', 'Le Kenya']],
  ['music', 'Burna Boy and Wizkid are stars of which music style?', ['K-pop', 'Afrobeats', 'Country', 'Flamenco'], 1, 'Burna Boy et Wizkid sont des stars de quel style ?', ['La K-pop', 'L’afrobeats', 'La country', 'Le flamenco']],
  ['music', 'Which composer wrote the “Moonlight” Sonata?', ['Mozart', 'Beethoven', 'Bach', 'Chopin'], 1, 'Quel compositeur a écrit la sonate « Clair de lune » ?', ['Mozart', 'Beethoven', 'Bach', 'Chopin']],
  ['music', 'How many musicians play in a quartet?', ['Two', 'Three', 'Four', 'Five'], 2, 'Combien de musiciens jouent dans un quatuor ?', ['Deux', 'Trois', 'Quatre', 'Cinq']],
  ['music', 'Umm Kulthum was a legendary singer from which country?', ['Lebanon', 'Egypt', 'Morocco', 'Iraq'], 1, 'Oum Kalthoum était une chanteuse légendaire de quel pays ?', ['Le Liban', 'L’Égypte', 'Le Maroc', 'L’Irak']],
  ['music', 'Miriam Makeba, “Mama Africa”, was from which country?', ['South Africa', 'Nigeria', 'Kenya', 'Mali'], 0, 'Miriam Makeba, « Mama Africa », venait de quel pays ?', ['L’Afrique du Sud', 'Le Nigeria', 'Le Kenya', 'Le Mali']],
  ['music', 'Which instrument is a djembe?', ['A drum', 'A flute', 'A guitar', 'A trumpet'], 0, 'Quel instrument est le djembé ?', ['Un tambour', 'Une flûte', 'Une guitare', 'Une trompette']],
  ['music', 'Which of these is a stringed instrument?', ['Clarinet', 'Cello', 'Trombone', 'Tuba'], 1, 'Lequel de ces instruments est à cordes ?', ['La clarinette', 'Le violoncelle', 'Le trombone', 'Le tuba']],
  ['music', 'Queen’s lead singer was…', ['Freddie Mercury', 'Mick Jagger', 'Elton John', 'David Bowie'], 0, 'Le chanteur de Queen était…', ['Freddie Mercury', 'Mick Jagger', 'Elton John', 'David Bowie']],
  ['music', 'Which Nigerian singer released the hit “Calm Down” with Selena Gomez?', ['Rema', 'Davido', 'Tems', 'Asake'], 0, 'Quel chanteur nigérian a sorti le tube « Calm Down » avec Selena Gomez ?', ['Rema', 'Davido', 'Tems', 'Asake']],
  ['music', 'Benga is a popular music style from which country?', ['Kenya', 'Egypt', 'Ghana', 'South Africa'], 0, 'Le benga est un style musical populaire de quel pays ?', ['Le Kenya', 'L’Égypte', 'Le Ghana', 'L’Afrique du Sud']],
  ['music', 'Which singer recorded the album “21”?', ['Adele', 'Amy Winehouse', 'Dua Lipa', 'Ed Sheeran'], 0, 'Quelle chanteuse a enregistré l’album « 21 » ?', ['Adele', 'Amy Winehouse', 'Dua Lipa', 'Ed Sheeran']],

  // ---- The game's cities
  ['cities', 'Which river runs through London?', ['Nile', 'Seine', 'Thames', 'Danube'], 2, 'Quel fleuve traverse Londres ?', ['Le Nil', 'La Seine', 'La Tamise', 'Le Danube']],
  ['cities', 'Which city is known for the Golden Gate Bridge?', ['London', 'San Francisco', 'Dubai', 'Cairo'], 1, 'Quelle ville est connue pour le Golden Gate Bridge ?', ['Londres', 'San Francisco', 'Dubaï', 'Le Caire']],
  ['cities', 'What is the capital of Kenya?', ['Accra', 'Kigali', 'Nairobi', 'Lagos'], 2, 'Quelle est la capitale du Kenya ?', ['Accra', 'Kigali', 'Nairobi', 'Lagos']],
  ['cities', 'Which country is home to Kigali?', ['Ghana', 'Rwanda', 'Kenya', 'Egypt'], 1, 'Dans quel pays se trouve Kigali ?', ['Le Ghana', 'Le Rwanda', 'Le Kenya', 'L’Égypte']],
  ['cities', 'The world’s tallest building, the Burj Khalifa, is in which city?', ['Doha', 'Dubai', 'Riyadh', 'Abu Dhabi'], 1, 'Le plus haut bâtiment du monde, la Burj Khalifa, se trouve dans quelle ville ?', ['Doha', 'Dubaï', 'Riyad', 'Abou Dabi']],
  ['cities', 'Roughly how tall is the Burj Khalifa?', ['540 m', '630 m', '828 m', '1,000 m'], 2, 'Quelle est la hauteur approximative de la Burj Khalifa ?', ['540 m', '630 m', '828 m', '1 000 m']],
  ['cities', 'Which river flows through Cairo?', ['Congo', 'Niger', 'Nile', 'Zambezi'], 2, 'Quel fleuve traverse Le Caire ?', ['Le Congo', 'Le Niger', 'Le Nil', 'Le Zambèze']],
  ['cities', 'Freetown is the capital of which country?', ['Liberia', 'Sierra Leone', 'Guinea', 'Gambia'], 1, 'Freetown est la capitale de quel pays ?', ['Le Liberia', 'La Sierra Leone', 'La Guinée', 'La Gambie']],
  ['cities', 'Accra is the capital of which country?', ['Ghana', 'Togo', 'Benin', 'Ivory Coast'], 0, 'Accra est la capitale de quel pays ?', ['Le Ghana', 'Le Togo', 'Le Bénin', 'La Côte d’Ivoire']],
  ['cities', 'Johannesburg grew rapidly after the discovery of what in 1886?', ['Oil', 'Diamonds', 'Gold', 'Copper'], 2, 'Johannesburg s’est développée rapidement après la découverte de quoi en 1886 ?', ['Du pétrole', 'Des diamants', 'De l’or', 'Du cuivre']],
  ['cities', 'Lagos was Nigeria’s capital until 1991. Which city replaced it?', ['Kano', 'Abuja', 'Ibadan', 'Port Harcourt'], 1, 'Lagos a été la capitale du Nigeria jusqu’en 1991. Quelle ville l’a remplacée ?', ['Kano', 'Abuja', 'Ibadan', 'Port Harcourt']],
  ['cities', 'Which London landmark is a giant observation wheel on the South Bank?', ['The Shard', 'The London Eye', 'The Gherkin', 'Tower Bridge'], 1, 'Quel monument de Londres est une grande roue d’observation sur la South Bank ?', ['The Shard', 'Le London Eye', 'The Gherkin', 'Tower Bridge']],
  ['cities', 'What is the name of the famous bell in London’s Elizabeth Tower?', ['Big Ben', 'Great Tom', 'Old Bailey', 'Little John'], 0, 'Comment s’appelle la célèbre cloche de l’Elizabeth Tower à Londres ?', ['Big Ben', 'Great Tom', 'Old Bailey', 'Little John']],
  ['cities', 'The former prison island in San Francisco Bay is…', ['Angel Island', 'Alcatraz', 'Treasure Island', 'Ellis Island'], 1, 'L’ancienne île-prison de la baie de San Francisco est…', ['Angel Island', 'Alcatraz', 'Treasure Island', 'Ellis Island']],
  ['cities', 'San Francisco’s historic cable cars are pulled by…', ['Overhead wires', 'Cables under the street', 'Diesel engines', 'Horses'], 1, 'Les célèbres cable cars de San Francisco sont tirés par…', ['Des fils aériens', 'Des câbles sous la chaussée', 'Des moteurs diesel', 'Des chevaux']],
  ['cities', 'Which famous palm-shaped island is in Dubai?', ['Palm Jumeirah', 'Palm Beach', 'Palm Springs', 'Palm Cove'], 0, 'Quelle célèbre île en forme de palmier se trouve à Dubaï ?', ['Palm Jumeirah', 'Palm Beach', 'Palm Springs', 'Palm Cove']],
  ['cities', 'The Great Pyramid stands at Giza, next to which city?', ['Alexandria', 'Luxor', 'Cairo', 'Aswan'], 2, 'La Grande Pyramide se dresse à Gizeh, près de quelle ville ?', ['Alexandrie', 'Louxor', 'Le Caire', 'Assouan']],
  ['cities', 'Nairobi National Park is famous because…', ['It lies right next to a capital city', 'It is underwater', 'It is in a desert', 'It is on an island'], 0, 'Le parc national de Nairobi est célèbre parce que…', ['Il se trouve juste à côté d’une capitale', 'Il est sous l’eau', 'Il est dans un désert', 'Il est sur une île']],
  ['cities', 'Kigali is often praised for being…', ['Very clean and safe', 'The largest city in Africa', 'Below sea level', 'Built on an island'], 0, 'On vante souvent Kigali pour être…', ['Très propre et sûre', 'La plus grande ville d’Afrique', 'Sous le niveau de la mer', 'Bâtie sur une île']],
  ['cities', 'Rwanda is known as the land of a thousand…', ['Lakes', 'Hills', 'Rivers', 'Forests'], 1, 'On surnomme le Rwanda le pays des mille…', ['Lacs', 'Collines', 'Rivières', 'Forêts']],
  ['cities', 'Which Lagos bridge links Lekki and Ikoyi with a cable-stayed span?', ['Third Mainland Bridge', 'Lekki–Ikoyi Link Bridge', 'Carter Bridge', 'Eko Bridge'], 1, 'Quel pont de Lagos relie Lekki à Ikoyi par une travée à haubans ?', ['Third Mainland Bridge', 'Lekki–Ikoyi Link Bridge', 'Carter Bridge', 'Eko Bridge']],
  ['cities', 'The Cotton Tree is a historic symbol of which city?', ['Accra', 'Freetown', 'Monrovia', 'Dakar'], 1, 'Le Cotton Tree est un symbole historique de quelle ville ?', ['Accra', 'Freetown', 'Monrovia', 'Dakar']],
  ['cities', 'Which city is home to Kwame Nkrumah Memorial Park?', ['Kumasi', 'Accra', 'Lomé', 'Tamale'], 1, 'Quelle ville abrite le parc commémoratif Kwame Nkrumah ?', ['Kumasi', 'Accra', 'Lomé', 'Tamale']],
  ['cities', 'Which London skyscraper is nicknamed “the Gherkin”?', ['20 Fenchurch Street', '30 St Mary Axe', 'One Canada Square', 'The Shard'], 1, 'Quel gratte-ciel londonien surnomme-t-on « le Cornichon » (the Gherkin) ?', ['20 Fenchurch Street', '30 St Mary Axe', 'One Canada Square', 'The Shard']],
  ['cities', 'What is the tallest building in San Francisco?', ['Transamerica Pyramid', 'Salesforce Tower', 'Coit Tower', '181 Fremont'], 1, 'Quel est le plus haut bâtiment de San Francisco ?', ['Transamerica Pyramid', 'Salesforce Tower', 'Coit Tower', '181 Fremont']],
  ['cities', 'Which is London’s tallest skyscraper, opened in 2012?', ['The Shard', 'One Canada Square', 'The Gherkin', 'Tower 42'], 0, 'Quel est le plus haut gratte-ciel de Londres, inauguré en 2012 ?', ['The Shard', 'One Canada Square', 'The Gherkin', 'Tower 42']],
  ['cities', 'In which city is the Mandela Bridge?', ['Cape Town', 'Johannesburg', 'Durban', 'Pretoria'], 1, 'Dans quelle ville se trouve le pont Nelson Mandela ?', ['Le Cap', 'Johannesburg', 'Durban', 'Pretoria']],
  ['cities', 'Cairo Tower stands on which island in the Nile?', ['Gezira (Zamalek)', 'Roda', 'Philae', 'Elephantine'], 0, 'Sur quelle île du Nil se dresse la tour du Caire ?', ['Gezira (Zamalek)', 'Roda', 'Philae', 'Éléphantine']],
  ['cities', 'Which ocean does Freetown’s Lumley Beach face?', ['Indian Ocean', 'Atlantic Ocean', 'Pacific Ocean', 'Arctic Ocean'], 1, 'Sur quel océan donne la plage de Lumley à Freetown ?', ['L’océan Indien', 'L’océan Atlantique', 'L’océan Pacifique', 'L’océan Arctique']],
  ['cities', 'Which of the game’s cities lies almost on the equator?', ['Nairobi', 'Cairo', 'London', 'Johannesburg'], 0, 'Laquelle des villes du jeu se trouve presque sur l’équateur ?', ['Nairobi', 'Le Caire', 'Londres', 'Johannesburg']],
  ['cities', 'Dubai is one of the seven emirates of which country?', ['Qatar', 'Oman', 'United Arab Emirates', 'Bahrain'], 2, 'Dubaï est l’un des sept émirats de quel pays ?', ['Le Qatar', 'Oman', 'Les Émirats arabes unis', 'Bahreïn']],
  ['cities', 'London’s cable car crosses the Thames between Greenwich Peninsula and…', ['Royal Docks', 'Westminster', 'Battersea', 'Richmond'], 0, 'Le téléphérique de Londres traverse la Tamise entre la péninsule de Greenwich et…', ['Les Royal Docks', 'Westminster', 'Battersea', 'Richmond']],
  ['cities', 'What is Dubai’s giant observation wheel on Bluewaters Island called?', ['Ain Dubai', 'Dubai Eye', 'Sky Wheel', 'Gulf Wheel'], 0, 'Comment s’appelle la grande roue de Dubaï sur l’île de Bluewaters ?', ['Ain Dubai', 'Dubai Eye', 'Sky Wheel', 'Gulf Wheel']],
  ['cities', 'Silicon Valley lies to the south of which city?', ['Los Angeles', 'San Francisco', 'Seattle', 'San Diego'], 1, 'La Silicon Valley se trouve au sud de quelle ville ?', ['Los Angeles', 'San Francisco', 'Seattle', 'San Diego']],
  ['cities', 'Which Nairobi landmark has a helipad on its roof with views over the city?', ['KICC', 'Kenyatta Hospital', 'Nyayo Stadium', 'Times Tower'], 0, 'Quel monument de Nairobi a un héliport sur son toit avec vue sur la ville ?', ['Le KICC', 'L’hôpital Kenyatta', 'Le stade Nyayo', 'Times Tower']],

  // ---- Science
  ['science', 'Which planet is closest to the Sun?', ['Venus', 'Mercury', 'Mars', 'Earth'], 1, 'Quelle planète est la plus proche du Soleil ?', ['Vénus', 'Mercure', 'Mars', 'La Terre']],
  ['science', 'Which gas do plants absorb during photosynthesis?', ['Oxygen', 'Carbon dioxide', 'Helium', 'Hydrogen'], 1, 'Quel gaz les plantes absorbent-elles pendant la photosynthèse ?', ['L’oxygène', 'Le dioxyde de carbone', 'L’hélium', 'L’hydrogène']],
  ['science', 'In what unit is electrical resistance measured?', ['Watt', 'Volt', 'Ohm', 'Ampere'], 2, 'En quelle unité mesure-t-on la résistance électrique ?', ['Le watt', 'Le volt', 'L’ohm', 'L’ampère']],
  ['science', 'What is the chemical symbol for gold?', ['Go', 'Gd', 'Au', 'Ag'], 2, 'Quel est le symbole chimique de l’or ?', ['Go', 'Gd', 'Au', 'Ag']],
  ['science', 'What is H2O more commonly called?', ['Salt', 'Water', 'Hydrogen', 'Ozone'], 1, 'Comment appelle-t-on plus couramment H2O ?', ['Le sel', 'L’eau', 'L’hydrogène', 'L’ozone']],
  ['science', 'How many bones are in the adult human body?', ['106', '206', '306', '406'], 1, 'Combien d’os compte le corps humain adulte ?', ['106', '206', '306', '406']],
  ['science', 'Which organ pumps blood around the body?', ['Liver', 'Lungs', 'Heart', 'Kidneys'], 2, 'Quel organe pompe le sang dans le corps ?', ['Le foie', 'Les poumons', 'Le cœur', 'Les reins']],
  ['science', 'What force keeps us on the ground?', ['Magnetism', 'Gravity', 'Friction', 'Electricity'], 1, 'Quelle force nous maintient au sol ?', ['Le magnétisme', 'La gravité', 'Le frottement', 'L’électricité']],
  ['science', 'What is the largest planet in our solar system?', ['Saturn', 'Jupiter', 'Neptune', 'Earth'], 1, 'Quelle est la plus grande planète du système solaire ?', ['Saturne', 'Jupiter', 'Neptune', 'La Terre']],
  ['science', 'At sea level, water boils at what temperature?', ['90 °C', '100 °C', '110 °C', '120 °C'], 1, 'Au niveau de la mer, l’eau bout à quelle température ?', ['90 °C', '100 °C', '110 °C', '120 °C']],
  ['science', 'What do we call animals that eat only plants?', ['Carnivores', 'Herbivores', 'Omnivores', 'Insectivores'], 1, 'Comment appelle-t-on les animaux qui ne mangent que des plantes ?', ['Les carnivores', 'Les herbivores', 'Les omnivores', 'Les insectivores']],
  ['science', 'Which gas makes up most of Earth’s atmosphere?', ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Argon'], 1, 'Quel gaz compose la plus grande partie de l’atmosphère terrestre ?', ['L’oxygène', 'L’azote', 'Le dioxyde de carbone', 'L’argon']],
  ['science', 'Light travels fastest through…', ['Water', 'Glass', 'A vacuum', 'Air'], 2, 'La lumière voyage le plus vite dans…', ['L’eau', 'Le verre', 'Le vide', 'L’air']],
  ['science', 'Which vitamin does sunlight help the body make?', ['Vitamin A', 'Vitamin C', 'Vitamin D', 'Vitamin K'], 2, 'Quelle vitamine le soleil aide-t-il le corps à fabriquer ?', ['La vitamine A', 'La vitamine C', 'La vitamine D', 'La vitamine K']],
  ['science', 'What is the centre of an atom called?', ['Electron', 'Nucleus', 'Proton shell', 'Orbit'], 1, 'Comment appelle-t-on le centre d’un atome ?', ['L’électron', 'Le noyau', 'La couche de protons', 'L’orbite']],
  ['science', 'Which blood cells fight infection?', ['Red blood cells', 'White blood cells', 'Platelets', 'Plasma'], 1, 'Quelles cellules sanguines combattent les infections ?', ['Les globules rouges', 'Les globules blancs', 'Les plaquettes', 'Le plasma']],
  ['science', 'How long does Earth take to orbit the Sun?', ['A day', 'A month', 'About a year', 'Ten years'], 2, 'Combien de temps la Terre met-elle pour faire le tour du Soleil ?', ['Un jour', 'Un mois', 'Environ un an', 'Dix ans']],
  ['science', 'What is the chemical symbol for iron?', ['Ir', 'Fe', 'In', 'I'], 1, 'Quel est le symbole chimique du fer ?', ['Ir', 'Fe', 'In', 'I']],
  ['science', 'Solar panels turn sunlight into…', ['Water', 'Electricity', 'Wind', 'Oil'], 1, 'Les panneaux solaires transforment la lumière du soleil en…', ['Eau', 'Électricité', 'Vent', 'Pétrole']],
  ['science', 'Which planet has the most famous rings?', ['Mars', 'Venus', 'Saturn', 'Mercury'], 2, 'Quelle planète a les anneaux les plus célèbres ?', ['Mars', 'Vénus', 'Saturne', 'Mercure']],

  // ---- Geography
  ['geography', 'Which ocean lies west of Africa?', ['Pacific', 'Indian', 'Atlantic', 'Arctic'], 2, 'Quel océan se trouve à l’ouest de l’Afrique ?', ['Le Pacifique', 'L’océan Indien', 'L’Atlantique', 'L’Arctique']],
  ['geography', 'Which is the largest continent by land area?', ['Africa', 'Europe', 'Asia', 'Australia'], 2, 'Quel est le plus grand continent par superficie ?', ['L’Afrique', 'L’Europe', 'L’Asie', 'L’Australie']],
  ['geography', 'What is the tallest mountain in Africa?', ['Mount Kenya', 'Kilimanjaro', 'Mount Stanley', 'Ras Dashen'], 1, 'Quelle est la plus haute montagne d’Afrique ?', ['Le mont Kenya', 'Le Kilimandjaro', 'Le mont Stanley', 'Le Ras Dashen']],
  ['geography', 'What is the largest desert in Africa?', ['Kalahari', 'Namib', 'Sahara', 'Danakil'], 2, 'Quel est le plus grand désert d’Afrique ?', ['Le Kalahari', 'Le Namib', 'Le Sahara', 'Le Danakil']],
  ['geography', 'What is the capital of France?', ['Lyon', 'Marseille', 'Paris', 'Nice'], 2, 'Quelle est la capitale de la France ?', ['Lyon', 'Marseille', 'Paris', 'Nice']],
  ['geography', 'What is the capital of Japan?', ['Osaka', 'Kyoto', 'Tokyo', 'Seoul'], 2, 'Quelle est la capitale du Japon ?', ['Osaka', 'Kyoto', 'Tokyo', 'Séoul']],
  ['geography', 'What is the capital of Egypt?', ['Alexandria', 'Cairo', 'Giza', 'Luxor'], 1, 'Quelle est la capitale de l’Égypte ?', ['Alexandrie', 'Le Caire', 'Gizeh', 'Louxor']],
  ['geography', 'Which country has the largest population in Africa?', ['Egypt', 'Ethiopia', 'Nigeria', 'DR Congo'], 2, 'Quel pays d’Afrique est le plus peuplé ?', ['L’Égypte', 'L’Éthiopie', 'Le Nigeria', 'La RD Congo']],
  ['geography', 'Lake Victoria is shared by Kenya, Tanzania and…', ['Rwanda', 'Uganda', 'Ethiopia', 'Malawi'], 1, 'Le lac Victoria est partagé par le Kenya, la Tanzanie et…', ['Le Rwanda', 'L’Ouganda', 'L’Éthiopie', 'Le Malawi']],
  ['geography', 'Which line divides Earth into northern and southern hemispheres?', ['Prime meridian', 'Equator', 'Tropic of Cancer', 'Date line'], 1, 'Quelle ligne divise la Terre en hémisphères nord et sud ?', ['Le méridien d’origine', 'L’équateur', 'Le tropique du Cancer', 'La ligne de changement de date']],
  ['geography', 'The prime meridian (0° longitude) passes through which London district?', ['Greenwich', 'Camden', 'Chelsea', 'Hackney'], 0, 'Le méridien d’origine (longitude 0°) passe par quel quartier de Londres ?', ['Greenwich', 'Camden', 'Chelsea', 'Hackney']],
  ['geography', 'Which country is shaped like a boot?', ['Spain', 'Italy', 'Greece', 'Portugal'], 1, 'Quel pays a la forme d’une botte ?', ['L’Espagne', 'L’Italie', 'La Grèce', 'Le Portugal']],
  ['geography', 'What is the largest ocean?', ['Atlantic', 'Indian', 'Pacific', 'Southern'], 2, 'Quel est le plus grand océan ?', ['L’Atlantique', 'L’océan Indien', 'Le Pacifique', 'L’océan Austral']],
  ['geography', 'Which African country is completely surrounded by South Africa?', ['Eswatini', 'Lesotho', 'Botswana', 'Namibia'], 1, 'Quel pays africain est entièrement entouré par l’Afrique du Sud ?', ['L’Eswatini', 'Le Lesotho', 'Le Botswana', 'La Namibie']],
  ['geography', 'The Great Rift Valley runs through which region?', ['West Africa', 'East Africa', 'North Africa', 'Madagascar'], 1, 'La vallée du Grand Rift traverse quelle région ?', ['L’Afrique de l’Ouest', 'L’Afrique de l’Est', 'L’Afrique du Nord', 'Madagascar']],
  ['geography', 'Which sea lies between Africa and Arabia?', ['Black Sea', 'Red Sea', 'Caspian Sea', 'North Sea'], 1, 'Quelle mer sépare l’Afrique de l’Arabie ?', ['La mer Noire', 'La mer Rouge', 'La mer Caspienne', 'La mer du Nord']],
  ['geography', 'What is the capital of the United States?', ['New York', 'Washington, D.C.', 'Los Angeles', 'Chicago'], 1, 'Quelle est la capitale des États-Unis ?', ['New York', 'Washington', 'Los Angeles', 'Chicago']],
  ['geography', 'The Niger River gives its name to Niger and which other country?', ['Ghana', 'Nigeria', 'Mali', 'Chad'], 1, 'Le fleuve Niger a donné son nom au Niger et à quel autre pays ?', ['Le Ghana', 'Le Nigeria', 'Le Mali', 'Le Tchad']],
  ['geography', 'In which country is Victoria Falls, on the border with Zimbabwe?', ['Zambia', 'Botswana', 'Mozambique', 'Malawi'], 0, 'Les chutes Victoria se trouvent à la frontière du Zimbabwe et de quel pays ?', ['La Zambie', 'Le Botswana', 'Le Mozambique', 'Le Malawi']],
];

const toQuestion = ([cat, text, options, answer, fr, fro]: Row): BankQuestion => ({
  cat,
  text,
  options,
  answer,
  fr: { text: fr, options: fro },
});

/** The first bank, unchanged: worlds without FEEDBACK_NOTE draw from it as they always did. */
export const QUIZ_BANK: readonly BankQuestion[] = ROWS.map(toQuestion);

/** The full bank (FEEDBACK_NOTE): the first bank, then the feedback round's questions. */
export const QUIZ_BANK_FULL: readonly BankQuestion[] = [...QUIZ_BANK, ...MORE_ROWS.map(toQuestion)];
