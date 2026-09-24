export const PUBLIC_ORIGIN = "https://fakturaprosto.pl";
export const REVIEW_DATE = "2026-09-24";

export type Topic = {
  path: string;
  title: string;
  description: string;
  answer: string;
  sections: { title: string; body: string }[];
  example: string;
  caution: string;
  sources: { title: string; url: string }[];
  related: string[];
};

const ksefScope = "https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/zakres-obowiazkowego-ksef/";
const threshold = "https://ksef.podatki.gov.pl/ponizej-10-000-zl/";
const vatRates = "https://www.podatki.gov.pl/podatki-firmowe/vat/stawki-i-limity";
const ksefQuestions = "https://ksef.podatki.gov.pl/ksef-news/najczestsze-pytania/";

export const topics: Topic[] = [
  {
    path: "/faktury/jak-wystawic",
    title: "Jak wystawić fakturę online krok po kroku?",
    description: "Dane do faktury, kontrola kwot i status KSeF. Krótka instrukcja z przykładem oraz demo faktury bez rejestracji.",
    answer: "Zbierz dane sprzedawcy i nabywcy, daty, opis sprzedaży, ilość, cenę i właściwy sposób opodatkowania. Sprawdź kwoty i dane przed zatwierdzeniem. Jeśli faktura podlega obowiązkowi KSeF, sprawdź jej status po wysyłce; samo przygotowanie PDF nie oznacza przyjęcia przez KSeF.",
    sections: [
      { title: "1. Wprowadź strony i przedmiot sprzedaży", body: "Podaj dane wystawcy i nabywcy oraz to, co zostało sprzedane. Zweryfikuj NIP firmy przed zapisaniem dokumentu. Wybierz odpowiedni typ faktury, np. zwykłą, zaliczkową lub korygującą." },
      { title: "2. Sprawdź daty i obliczenia", body: "Zweryfikuj datę wystawienia, datę sprzedaży, cenę, liczbę jednostek, stawkę lub podstawę zwolnienia oraz kwotę do zapłaty. Nie wybieraj stawki VAT tylko na podstawie nazwy towaru; znaczenie mają warunki danej transakcji." },
      { title: "3. Zatwierdź i sprawdź rezultat", body: "Po zatwierdzeniu sprawdź podgląd i sposób udostępnienia faktury. Gdy faktura jest wysyłana do KSeF, upewnij się, że otrzymała numer nadany przez system; dokument oczekujący lub odrzucony wymaga dalszego działania." },
    ],
    example: "Wystawiasz fakturę za usługę za 100 zł netto. Przy założeniu, że dla tej konkretnej usługi właściwa jest stawka 23%, VAT wyniesie 23 zł, a brutto 123 zł. Stawkę potwierdź dla własnej transakcji.",
    caution: "Demo pokazuje przykładowy przebieg i nie wysyła dokumentu do produkcyjnego KSeF.",
    sources: [{ title: "MF: zakres obowiązkowego KSeF", url: ksefScope }, { title: "MF: stawki i limity VAT", url: vatRates }],
    related: ["/faktury/bez-vat", "/poradnik-ksef/jdg", "/narzedzia/kalkulator-vat"],
  },
  {
    path: "/faktury/bez-vat",
    title: "Faktura bez VAT: kiedy i jak ją wystawić?",
    description: "Faktura bez VAT a zwolnienie z podatku. Sprawdź różnicę między zwolnieniem, stawką 0% i obowiązkiem KSeF.",
    answer: "Faktura bez wykazanego VAT może dotyczyć sprzedaży objętej zwolnieniem. Zwolnienie z VAT i stawka 0% to różne sytuacje: przed wystawieniem dokumentu ustal właściwą podstawę. Samo zwolnienie z VAT nie zwalnia automatycznie z obowiązku KSeF.",
    sections: [
      { title: "Ustal podstawę zwolnienia", body: "Od 1 stycznia 2026 r. limit zwolnienia podmiotowego wynosi 240 000 zł, ale obowiązują warunki i wyłączenia. Przy rozpoczęciu działalności w trakcie roku sprawdź zasady proporcji. Możliwe jest także zwolnienie wynikające z rodzaju czynności." },
      { title: "Oddziel zwolnienie od stawki 0%", body: "Stawka 0% jest stawką podatku stosowaną przy spełnieniu określonych przesłanek. Zwolnienie oznacza inny status podatkowy transakcji. Nie zastępuj jednego oznaczenia drugim tylko dlatego, że kwota VAT wynosi 0 zł." },
      { title: "Sprawdź KSeF osobno", body: "Podatnicy zwolnieni z VAT także podlegają zasadom obowiązkowego KSeF, z uwzględnieniem etapów wdrożenia, wyjątków i przepisów przejściowych." },
    ],
    example: "Firma korzysta ze zwolnienia podmiotowego i świadczy usługę za 400 zł. Weryfikuje, czy zwolnienie obejmuje tę sprzedaż, i nie wpisuje automatycznie stawki 0% zamiast podstawy zwolnienia.",
    caution: "Limit 240 000 zł dotyczy zwolnienia z VAT; próg 10 000 zł to odrębna, przejściowa zasada KSeF w 2026 r.",
    sources: [{ title: "MF: zwolnienia i stawki VAT", url: vatRates }, { title: "MF: zakres obowiązkowego KSeF", url: ksefScope }],
    related: ["/poradnik-ksef/jdg", "/poradnik-ksef/limit-10000-zl", "/faktury/jak-wystawic"],
  },
  {
    path: "/faktury/zaliczkowa",
    title: "Faktura zaliczkowa: jak rozliczyć wpłatę?",
    description: "Zaliczka, wartość zamówienia i faktura rozliczająca. Zobacz przykład z kwotami i źródło Ministerstwa Finansów.",
    answer: "Faktura zaliczkowa dokumentuje otrzymanie zapłaty przed dostawą towaru lub wykonaniem usługi, gdy w danej sytuacji trzeba ją udokumentować fakturą. Jeśli zaliczki nie pokrywają całej ceny, po wykonaniu świadczenia wystawiana jest faktura rozliczająca pozostałą należność.",
    sections: [
      { title: "Zapisz wartość zamówienia i otrzymane wpłaty", body: "Nie myl wartości całego zamówienia z kwotą konkretnej zaliczki. Przy kilku wpłatach zachowaj powiązania między dokumentami, aby rozliczenie nie naliczyło należności drugi raz." },
      { title: "Rozlicz pozostałą kwotę", body: "Jeżeli suma zaliczek jest mniejsza od ceny, faktura rozliczająca uwzględnia wcześniejsze dokumenty. Gdy zaliczki pokryły całą zapłatę, sprawdź odrębne zasady dokumentowania zamówienia." },
    ],
    example: "Zamówienie ma wartość 1 230 zł brutto, a klient wpłacił 300 zł. Do zapłaty pozostaje 930 zł brutto; sposób wykazania podatku i danych dokumentów zależy od szczegółów transakcji.",
    caution: "Ten przykład pokazuje przepływ kwot, nie ustala stawki VAT ani momentu powstania obowiązku podatkowego w konkretnej sprawie.",
    sources: [{ title: "MF: pytania i odpowiedzi KSeF 2.0", url: "https://ksef.podatki.gov.pl/pytania-i-odpowiedzi-ksef-20/" }],
    related: ["/faktury/koncowa", "/faktury/jak-wystawic"],
  },
  {
    path: "/faktury/koncowa",
    title: "Faktura końcowa po zaliczkach: co wykazać?",
    description: "Sprawdź rozliczenie wcześniejszych zaliczek na prostym przykładzie. Powiązanie z fakturą zaliczkową i KSeF.",
    answer: "Jeżeli wcześniejsze faktury zaliczkowe nie objęły całej zapłaty, faktura rozliczająca uwzględnia kwoty wcześniejszych wpłat i identyfikuje powiązane dokumenty zgodnie z zasadami dotyczącymi danej transakcji.",
    sections: [
      { title: "Zbierz wszystkie zaliczki", body: "Ustal, jaka część zamówienia została już zafakturowana i zapłacona. Sprawdź numery wcześniejszych faktur, a przy dokumentach KSeF także właściwe numery nadane przez system." },
      { title: "Pokaż saldo do rozliczenia", body: "Wartość całego zamówienia, wcześniej otrzymane wpłaty i pozostała należność powinny dawać spójny wynik. Przy różnych stawkach lub zmianie zamówienia potrzebna jest osobna analiza pozycji." },
    ],
    example: "Zamówienie: 1 230 zł brutto. Wcześniejsze zaliczki: 300 zł i 430 zł. Pozostała kwota: 500 zł brutto. Przed wystawieniem sprawdź kwoty i powiązane numery dokumentów.",
    caution: "Proste odejmowanie kwot brutto nie zastępuje poprawnego rozliczenia podatku przy wielu stawkach lub korektach.",
    sources: [{ title: "MF: pytania i odpowiedzi KSeF 2.0", url: "https://ksef.podatki.gov.pl/pytania-i-odpowiedzi-ksef-20/" }],
    related: ["/faktury/zaliczkowa", "/poradnik-ksef/numer-faktury"],
  },
  {
    path: "/faktury/korygujaca",
    title: "Faktura korygująca: co zrobić z błędem?",
    description: "Kiedy wystawić korektę i dlaczego faktury przyjętej przez KSeF nie można po prostu edytować.",
    answer: "Po przyjęciu faktury przez KSeF nie można jej edytować ani usunąć. Błąd poprawia wystawca fakturą korygującą powiązaną z dokumentem pierwotnym. Najpierw sprawdź, czy dokument rzeczywiście został przyjęty przez KSeF.",
    sections: [
      { title: "Sprawdź status dokumentu pierwotnego", body: "Szkic, odrzucona wysyłka i przyjęta faktura to różne stany. Numer KSeF i potwierdzenie przyjęcia mają znaczenie dla dalszej ścieżki poprawienia błędu." },
      { title: "Ustal, co się zmienia", body: "Korekta może dotyczyć kwot albo innych danych. Powiąż ją z właściwą fakturą i pokaż dane przed zmianą oraz po zmianie tam, gdzie jest to wymagane." },
    ],
    example: "Na przyjętej fakturze wpisano błędną cenę. Nie poprawiasz pliku XML pierwotnej faktury; wystawiasz powiązaną z nią fakturę korygującą.",
    caution: "Od 1 lutego 2026 r. nie wystawia się not korygujących ani w KSeF, ani poza nim.",
    sources: [{ title: "MF: najczęstsze pytania o KSeF", url: ksefQuestions }, { title: "MF: zakres obowiązkowego KSeF", url: ksefScope }],
    related: ["/poradnik-ksef/numer-faktury", "/poradnik-ksef/jdg"],
  },
  {
    path: "/faktury/dla-osoby-prywatnej",
    title: "Faktura dla osoby prywatnej a KSeF",
    description: "Czy faktura dla konsumenta trafia do KSeF? Krótka odpowiedź z przykładem i źródłem Ministerstwa Finansów.",
    answer: "Wystawianie faktur dla konsumentów w KSeF jest dobrowolne. Jeśli sprzedawca zdecyduje się wystawić taką fakturę w KSeF, przekazuje ją nabywcy w uzgodniony sposób.",
    sections: [
      { title: "Rozpoznaj rodzaj nabywcy", body: "Oddziel sprzedaż dla firmy od sprzedaży dla osoby fizycznej nieprowadzącej działalności gospodarczej. To rozróżnienie wpływa na ocenę obowiązku KSeF." },
      { title: "Ustal sposób przekazania", body: "Jeżeli faktura konsumencka została wystawiona w KSeF, sama obecność w systemie nie oznacza, że konsument ją odebrał. Uzgodnij sposób udostępnienia dokumentu." },
    ],
    example: "Osoba prywatna prosi o fakturę za zakup. Sprzedawca sprawdza zasady wystawienia dokumentu i może wybrać dobrowolne wystawienie go w KSeF.",
    caution: "Faktur konsumenckich nie wlicza się do przejściowego progu 10 000 zł dla faktur objętych obowiązkiem KSeF.",
    sources: [{ title: "MF: wystawianie i otrzymywanie faktur", url: "https://ksef.podatki.gov.pl/ksef-news/wystawianie-i-otrzymywanie-faktur/" }, { title: "MF: próg 10 000 zł", url: threshold }],
    related: ["/poradnik-ksef/limit-10000-zl", "/faktury/jak-wystawic"],
  },
  {
    path: "/poradnik-ksef/jdg",
    title: "KSeF dla JDG w 2026 roku: od kiedy obowiązek?",
    description: "Terminy wdrożenia KSeF dla JDG, wyjątek do 10 000 zł i faktury dla konsumentów. Odpowiedź oparta na źródłach MF.",
    answer: "Od 1 kwietnia 2026 r. obowiązek wystawiania faktur w KSeF obejmuje co do zasady pozostałych podatników, w tym JDG. Do końca 2026 r. obowiązuje szczególna zasada dla sprzedaży udokumentowanej fakturami nieprzekraczającej 10 000 zł brutto miesięcznie. Sprawdź też rodzaj transakcji i wyłączenia.",
    sections: [
      { title: "Sprawdź datę i rodzaj faktury", body: "Etap dla firm o sprzedaży powyżej 200 mln zł w 2024 r. rozpoczął się 1 lutego 2026 r. Dla pozostałych podatników rozpoczął się 1 kwietnia 2026 r. Odbiór faktur przez KSeF podlega odrębnym terminom." },
      { title: "Sprawdź wyjątek przejściowy", body: "Do końca 2026 r. część podatników może wystawiać faktury poza KSeF, jeżeli suma określonej sprzedaży udokumentowanej fakturami w miesiącu nie przekroczy 10 000 zł brutto. Faktura przekraczająca próg zmienia dalsze obowiązki." },
      { title: "Nie utożsamiaj VAT z KSeF", body: "Zwolnienie z VAT nie oznacza samo w sobie wyłączenia z KSeF. Faktury dla konsumentów nie są objęte obowiązkiem wystawiania w KSeF." },
    ],
    example: "JDG wystawia objęte KSeF faktury B2B na łączną kwotę 8 000 zł brutto, a następnie fakturę na 2 500 zł brutto. Ta druga przekracza próg 10 000 zł i należy ją uwzględnić w ocenie obowiązku KSeF.",
    caution: "Zasada 10 000 zł obowiązuje przejściowo do końca 2026 r.; przy nietypowych transakcjach najpierw sprawdź, czy faktura w ogóle należy do zakresu obowiązkowego KSeF.",
    sources: [{ title: "MF: zakres obowiązkowego KSeF", url: ksefScope }, { title: "MF: pytania o próg 10 000 zł", url: threshold }],
    related: ["/poradnik-ksef/limit-10000-zl", "/faktury/bez-vat", "/faktury/dla-osoby-prywatnej"],
  },
  {
    path: "/poradnik-ksef/limit-10000-zl",
    title: "Limit 10 000 zł w KSeF: która faktura go przekracza?",
    description: "Próg KSeF w 2026 r. na przykładach. Sprawdź, którą fakturę trzeba wystawić w KSeF i jak liczyć kolejne dokumenty.",
    answer: "Do końca 2026 r. przejściowy próg dotyczy określonych faktur wystawionych w danym miesiącu, a nie całego obrotu firmy. Jeżeli faktura przekracza sumę 10 000 zł brutto, już tę fakturę oraz kolejne faktury objęte obowiązkiem wystawia się w KSeF. Spadek wartości w następnym miesiącu nie przywraca tego wyjątku.",
    sections: [
      { title: "Policz właściwe faktury", body: "Uwzględnij datę wystawienia i tylko faktury wchodzące w zakres obowiązku KSeF. Faktury konsumenckie i sprzedaż udokumentowana wyłącznie kasą, bez faktury, nie zwiększają tej kwoty." },
      { title: "Sprawdź moment przekroczenia", body: "Kwota równa dokładnie 10 000 zł brutto nie przekracza progu. Dokument, który zwiększa sumę powyżej 10 000 zł, jest dokumentem, od którego stosuje się KSeF." },
      { title: "Uwzględnij następne miesiące", body: "Po przekroczeniu progu brak przekroczenia w kolejnym miesiącu nie oznacza powrotu do wyjątku. Zasada przejściowa kończy się wraz z 2026 r." },
    ],
    example: "Wrzesień: faktura 6 000 zł, następnie 4 000 zł, a potem 1 zł brutto. Pierwsze dwie dają dokładnie 10 000 zł; trzecia przekracza próg i podlega obowiązkowi KSeF. Wynik zakłada, że wszystkie trzy faktury wchodzą do limitu.",
    caution: "Ten próg jest niezależny od limitu zwolnienia podmiotowego z VAT. Kalkulator pokazuje tylko prosty przypadek; nie klasyfikuje rodzaju transakcji.",
    sources: [{ title: "MF: poniżej 10 000 zł", url: threshold }, { title: "MF: zakres obowiązkowego KSeF", url: ksefScope }],
    related: ["/poradnik-ksef/jdg", "/faktury/dla-osoby-prywatnej", "/narzedzia/limit-ksef"],
  },
  {
    path: "/poradnik-ksef/numer-faktury",
    title: "Numer KSeF: gdzie go znaleźć i kiedy powstaje?",
    description: "Numer faktury a numer KSeF to dwa różne identyfikatory. Sprawdź UPO i status przyjęcia dokumentu.",
    answer: "Numer KSeF jest nadawany przez system po przyjęciu faktury. Nie jest tym samym co numer faktury nadany przez wystawcę i nie znajduje się w treści XML faktury; można go odczytać z odpowiedzi KSeF lub UPO.",
    sections: [
      { title: "Odróżnij dwa numery", body: "Numer własny faktury służy do numeracji dokumentów sprzedawcy. Numer KSeF identyfikuje dokument w systemie KSeF i jest nadawany po jego przyjęciu." },
      { title: "Sprawdź status", body: "Nie uznawaj dokumentu za przyjęty wyłącznie dlatego, że wysyłka została rozpoczęta. Sprawdź wynik przetwarzania i przypisany numer KSeF w statusie lub UPO." },
    ],
    example: "Faktura oznaczona u sprzedawcy FV/09/2026/12 nadal może czekać na przyjęcie. Numer KSeF pojawi się dopiero po jego nadaniu przez system.",
    caution: "W trybach offline obowiązują odrębne zasady dat i terminów dosłania dokumentu.",
    sources: [{ title: "MF: najczęstsze pytania o numer KSeF", url: ksefQuestions }, { title: "MF: numer KSeF i zbiorczy identyfikator", url: "https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/numer-ksef-i-zbiorczy-identyfikator/" }],
    related: ["/faktury/korygujaca", "/poradnik-ksef/offline24"],
  },
  {
    path: "/poradnik-ksef/offline24",
    title: "KSeF offline24: co zrobić, gdy wystawiasz offline?",
    description: "Tryb offline24, data faktury i dalsza wysyłka do KSeF. Najważniejsze rozróżnienia z oficjalnym źródłem.",
    answer: "Tryb offline24 pozwala wystawić fakturę poza bieżącą sesją online, a następnie przesłać ją do KSeF zgodnie z właściwymi terminami. Nie należy utożsamiać go z awarią całkowitą systemu ani zakładać, że sam lokalny dokument ma już numer KSeF.",
    sections: [
      { title: "Zachowaj datę i dokument", body: "W trybie offline24 data wystawienia wynika z daty wskazanej na fakturze w polu P_1. Potrzebujesz też poprawnego dokumentu zgodnego z aktualną strukturą FA(3)." },
      { title: "Dosyłka i wynik", body: "Przed przekazaniem dokumentu nabywcy sprawdź wymagania dotyczące kodów weryfikacyjnych. Po przesłaniu do KSeF śledź wynik; numer KSeF pojawia się po przyjęciu." },
    ],
    example: "Wystawiasz dokument w trybie offline24 z datą 24 września. Przed uznaniem procesu za zamknięty sprawdzasz termin dosłania, właściwy sposób przekazania nabywcy i późniejszy status KSeF.",
    caution: "Tryby offline24, niedostępność KSeF i awaria całkowita mają różne zasady. Sprawdź oficjalny opis trybu pasującego do zdarzenia.",
    sources: [{ title: "MF: tryb offline24", url: "https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/tryb-offline24/" }],
    related: ["/poradnik-ksef/numer-faktury", "/poradnik-ksef/jdg"],
  },
  {
    path: "/vat/stawki",
    title: "Stawki VAT 2026: 23%, 8%, 5% i 0%",
    description: "Czym różnią się stawki VAT od zwolnienia? Źródło MF i kalkulator netto, VAT, brutto.",
    answer: "Podstawowa stawka VAT wynosi obecnie 23%. Stawki obniżone 8% i 5% oraz stawka 0% dotyczą transakcji spełniających określone warunki. Zwolnienie z VAT nie jest stawką 0%. Sam kalkulator kwot nie potwierdza, która stawka jest właściwa.",
    sections: [
      { title: "Najpierw ustal rodzaj transakcji", body: "Zanim obliczysz podatek, sprawdź rodzaj towaru lub usługi i przepisy określające warunki danej stawki. W szczególnych przypadkach znaczenie ma też kierunek transakcji i dokumenty potwierdzające." },
      { title: "Potem policz kwoty", body: "Dla ceny netto oblicz VAT według potwierdzonej stawki, a następnie dodaj go do netto. Dla ceny brutto wyodrębnij część netto i VAT, kontrolując zaokrąglenia przy wielu pozycjach." },
    ],
    example: "Dla 100 zł netto i potwierdzonej stawki 8% VAT wynosi 8 zł, a brutto 108 zł. Ten przykład ilustruje rachunek, nie klasyfikuje żadnego produktu.",
    caution: "Stawki i zwolnienia mogą mieć wyjątki i okresy obowiązywania; sprawdź aktualne źródło przed wystawieniem faktury.",
    sources: [{ title: "MF: stawki i limity VAT", url: vatRates }],
    related: ["/narzedzia/kalkulator-vat", "/faktury/bez-vat"],
  },
];

export const topicMap = new Map(topics.map(topic => [topic.path, topic]));
export const topicsFor = (prefix: string) => topics.filter(topic => topic.path.startsWith(prefix));
