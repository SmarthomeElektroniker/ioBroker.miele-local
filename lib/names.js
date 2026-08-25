'use strict';

/**
 * Übersetzungen der Datenpunktnamen.
 *
 * ioBroker empfiehlt für common.name ein i18n-Objekt mit elf Sprachen. Der Adapter lieferte
 * zunächst nur {en, de}; die Repository-Prüfung des PR #6471 quittierte das mit 145 Warnungen
 * (W1001) - je Datenpunkt eine. Fehler sind das nicht, aber sie stehen im Prüfbericht und
 * müssen sonst bei jeder Neuvorlage mit durchgeschleppt werden.
 *
 * Die Begriffe sind kurze Gerätebezeichnungen, keine Fließtexte. Bewusst nah am Original
 * gehalten: "Rohwert" etwa bezeichnet den unveränderten Zahlenwert des Geräts neben dem
 * lesbaren Text daneben - das muss in jeder Sprache als Klammerzusatz erkennbar bleiben.
 *
 * Aufbau: SPRACHNAMEN[kanal][datenpunkt] = { ru, pt, nl, fr, it, es, pl, uk, 'zh-cn' }.
 * Englisch und Deutsch kommen weiterhin aus den Felddefinitionen bzw. DE_NAMES, damit es
 * für diese beiden Sprachen nur eine Quelle gibt.
 */

const SPRACHNAMEN = {
    state: {
        status: { ru: 'Статус (сырое значение)', pt: 'Estado (valor bruto)', nl: 'Status (ruwe waarde)', fr: 'État (valeur brute)', it: 'Stato (valore grezzo)', es: 'Estado (valor bruto)', pl: 'Status (wartość surowa)', uk: 'Статус (сире значення)', 'zh-cn': '状态（原始值）' },
        statusText: { ru: 'Статус', pt: 'Estado', nl: 'Status', fr: 'État', it: 'Stato', es: 'Estado', pl: 'Status', uk: 'Статус', 'zh-cn': '状态' },
        programType: { ru: 'Тип программы (сырое значение)', pt: 'Tipo de programa (valor bruto)', nl: 'Programmatype (ruwe waarde)', fr: 'Type de programme (valeur brute)', it: 'Tipo di programma (valore grezzo)', es: 'Tipo de programa (valor bruto)', pl: 'Typ programu (wartość surowa)', uk: 'Тип програми (сире значення)', 'zh-cn': '程序类型（原始值）' },
        programTypeText: { ru: 'Тип программы', pt: 'Tipo de programa', nl: 'Programmatype', fr: 'Type de programme', it: 'Tipo di programma', es: 'Tipo de programa', pl: 'Typ programu', uk: 'Тип програми', 'zh-cn': '程序类型' },
        programId: { ru: 'Название программы (сырое значение)', pt: 'Nome do programa (valor bruto)', nl: 'Programmanaam (ruwe waarde)', fr: 'Nom du programme (valeur brute)', it: 'Nome del programma (valore grezzo)', es: 'Nombre del programa (valor bruto)', pl: 'Nazwa programu (wartość surowa)', uk: 'Назва програми (сире значення)', 'zh-cn': '程序名称（原始值）' },
        programText: { ru: 'Название программы', pt: 'Nome do programa', nl: 'Programmanaam', fr: 'Nom du programme', it: 'Nome del programma', es: 'Nombre del programa', pl: 'Nazwa programu', uk: 'Назва програми', 'zh-cn': '程序名称' },
        programPhase: { ru: 'Фаза программы (сырое значение)', pt: 'Fase do programa (valor bruto)', nl: 'Programmafase (ruwe waarde)', fr: 'Phase du programme (valeur brute)', it: 'Fase del programma (valore grezzo)', es: 'Fase del programa (valor bruto)', pl: 'Faza programu (wartość surowa)', uk: 'Фаза програми (сире значення)', 'zh-cn': '程序阶段（原始值）' },
        programPhaseText: { ru: 'Фаза программы', pt: 'Fase do programa', nl: 'Programmafase', fr: 'Phase du programme', it: 'Fase del programma', es: 'Fase del programa', pl: 'Faza programu', uk: 'Фаза програми', 'zh-cn': '程序阶段' },
        remainingMinutes: { ru: 'Оставшееся время (минуты)', pt: 'Tempo restante (minutos)', nl: 'Resterende tijd (minuten)', fr: 'Temps restant (minutes)', it: 'Tempo rimanente (minuti)', es: 'Tiempo restante (minutos)', pl: 'Pozostały czas (minuty)', uk: 'Час, що залишився (хвилини)', 'zh-cn': '剩余时间（分钟）' },
        remainingHHMM: { ru: 'Оставшееся время', pt: 'Tempo restante', nl: 'Resterende tijd', fr: 'Temps restant', it: 'Tempo rimanente', es: 'Tiempo restante', pl: 'Pozostały czas', uk: 'Час, що залишився', 'zh-cn': '剩余时间' },
        estimatedEndTime: { ru: 'Предполагаемое окончание', pt: 'Fim previsto', nl: 'Verwacht einde', fr: 'Fin prévue', it: 'Fine prevista', es: 'Fin previsto', pl: 'Przewidywany koniec', uk: 'Очікуване завершення', 'zh-cn': '预计结束' },
        estimatedEndTimeText: { ru: 'Предполагаемое окончание (время)', pt: 'Fim previsto (hora)', nl: 'Verwacht einde (tijdstip)', fr: 'Fin prévue (heure)', it: 'Fine prevista (ora)', es: 'Fin previsto (hora)', pl: 'Przewidywany koniec (godzina)', uk: 'Очікуване завершення (час)', 'zh-cn': '预计结束（时刻）' },
        elapsedMinutes: { ru: 'Прошедшее время (минуты)', pt: 'Tempo decorrido (minutos)', nl: 'Verstreken tijd (minuten)', fr: 'Temps écoulé (minutes)', it: 'Tempo trascorso (minuti)', es: 'Tiempo transcurrido (minutos)', pl: 'Czas, który upłynął (minuty)', uk: 'Час, що минув (хвилини)', 'zh-cn': '已用时间（分钟）' },
        elapsedHHMM: { ru: 'Прошедшее время', pt: 'Tempo decorrido', nl: 'Verstreken tijd', fr: 'Temps écoulé', it: 'Tempo trascorso', es: 'Tiempo transcurrido', pl: 'Czas, który upłynął', uk: 'Час, що минув', 'zh-cn': '已用时间' },
        startInMinutes: { ru: 'Отложенный старт (минуты)', pt: 'Início diferido (minutos)', nl: 'Uitgestelde start (minuten)', fr: 'Départ différé (minutes)', it: 'Avvio ritardato (minuti)', es: 'Inicio diferido (minutos)', pl: 'Opóźniony start (minuty)', uk: 'Відкладений старт (хвилини)', 'zh-cn': '预约启动（分钟）' },
        startHHMM: { ru: 'Отложенный старт', pt: 'Início diferido', nl: 'Uitgestelde start', fr: 'Départ différé', it: 'Avvio ritardato', es: 'Inicio diferido', pl: 'Opóźniony start', uk: 'Відкладений старт', 'zh-cn': '预约启动' },
        startTime: { ru: 'Время старта (метка времени)', pt: 'Hora de início (carimbo de data/hora)', nl: 'Starttijd (tijdstempel)', fr: 'Heure de début (horodatage)', it: 'Ora di avvio (timestamp)', es: 'Hora de inicio (marca de tiempo)', pl: 'Czas startu (znacznik czasu)', uk: 'Час старту (мітка часу)', 'zh-cn': '开始时间（时间戳）' },
        startTimeText: { ru: 'Время старта', pt: 'Hora de início', nl: 'Starttijd', fr: 'Heure de début', it: 'Ora di avvio', es: 'Hora de inicio', pl: 'Czas startu', uk: 'Час старту', 'zh-cn': '开始时间' },
        targetTemperature: { ru: 'Заданная температура', pt: 'Temperatura alvo', nl: 'Doeltemperatuur', fr: 'Température de consigne', it: 'Temperatura target', es: 'Temperatura objetivo', pl: 'Temperatura zadana', uk: 'Задана температура', 'zh-cn': '目标温度' },
        targetTemperatureZone2: { ru: 'Заданная температура, зона 2', pt: 'Temperatura alvo zona 2', nl: 'Doeltemperatuur zone 2', fr: 'Température de consigne zone 2', it: 'Temperatura target zona 2', es: 'Temperatura objetivo zona 2', pl: 'Temperatura zadana strefa 2', uk: 'Задана температура, зона 2', 'zh-cn': '目标温度 区域 2' },
        targetTemperatureZone3: { ru: 'Заданная температура, зона 3', pt: 'Temperatura alvo zona 3', nl: 'Doeltemperatuur zone 3', fr: 'Température de consigne zone 3', it: 'Temperatura target zona 3', es: 'Temperatura objetivo zona 3', pl: 'Temperatura zadana strefa 3', uk: 'Задана температура, зона 3', 'zh-cn': '目标温度 区域 3' },
        temperature: { ru: 'Температура', pt: 'Temperatura', nl: 'Temperatuur', fr: 'Température', it: 'Temperatura', es: 'Temperatura', pl: 'Temperatura', uk: 'Температура', 'zh-cn': '温度' },
        temperatureZone2: { ru: 'Температура, зона 2', pt: 'Temperatura zona 2', nl: 'Temperatuur zone 2', fr: 'Température zone 2', it: 'Temperatura zona 2', es: 'Temperatura zona 2', pl: 'Temperatura strefa 2', uk: 'Температура, зона 2', 'zh-cn': '温度 区域 2' },
        temperatureZone3: { ru: 'Температура, зона 3', pt: 'Temperatura zona 3', nl: 'Temperatuur zone 3', fr: 'Température zone 3', it: 'Temperatura zona 3', es: 'Temperatura zona 3', pl: 'Temperatura strefa 3', uk: 'Температура, зона 3', 'zh-cn': '温度 区域 3' },
        signalInfo: { ru: 'Информационный сигнал', pt: 'Sinal de informação', nl: 'Infosignaal', fr: 'Signal d\'information', it: 'Segnale informativo', es: 'Señal de información', pl: 'Sygnał informacyjny', uk: 'Інформаційний сигнал', 'zh-cn': '信息提示' },
        signalFailure: { ru: 'Сигнал неисправности', pt: 'Sinal de avaria', nl: 'Storingssignaal', fr: 'Signal de panne', it: 'Segnale di guasto', es: 'Señal de avería', pl: 'Sygnał usterki', uk: 'Сигнал несправності', 'zh-cn': '故障提示' },
        signalDoor: { ru: 'Дверь открыта', pt: 'Porta aberta', nl: 'Deur open', fr: 'Porte ouverte', it: 'Porta aperta', es: 'Puerta abierta', pl: 'Drzwi otwarte', uk: 'Дверцята відчинені', 'zh-cn': '门已打开' },
        mobileStart: { ru: 'MobileStart доступен', pt: 'MobileStart disponível', nl: 'MobileStart beschikbaar', fr: 'MobileStart disponible', it: 'MobileStart disponibile', es: 'MobileStart disponible', pl: 'MobileStart dostępny', uk: 'MobileStart доступний', 'zh-cn': 'MobileStart 可用' },
        remoteEnableRaw: { ru: 'Разрешение дистанционного управления (сырое значение)', pt: 'Autorização de controlo remoto (valor bruto)', nl: 'Vrijgave afstandsbediening (ruwe waarde)', fr: 'Autorisation de commande à distance (valeur brute)', it: 'Abilitazione comando remoto (valore grezzo)', es: 'Autorización de control remoto (valor bruto)', pl: 'Zezwolenie na sterowanie zdalne (wartość surowa)', uk: 'Дозвіл дистанційного керування (сире значення)', 'zh-cn': '远程控制授权（原始值）' },
        processAction: { ru: 'Действие процесса', pt: 'Ação do processo', nl: 'Procesactie', fr: 'Action du processus', it: 'Azione di processo', es: 'Acción del proceso', pl: 'Akcja procesu', uk: 'Дія процесу', 'zh-cn': '过程操作' },
        deviceAction: { ru: 'Действие устройства', pt: 'Ação do aparelho', nl: 'Apparaatactie', fr: 'Action de l\'appareil', it: 'Azione dell\'apparecchio', es: 'Acción del aparato', pl: 'Akcja urządzenia', uk: 'Дія пристрою', 'zh-cn': '设备操作' },
        light: { ru: 'Освещение', pt: 'Luz', nl: 'Verlichting', fr: 'Éclairage', it: 'Luce', es: 'Luz', pl: 'Oświetlenie', uk: 'Освітлення', 'zh-cn': '照明' },
        standbyState: { ru: 'Режим ожидания', pt: 'Estado de espera', nl: 'Stand-bytoestand', fr: 'État de veille', it: 'Stato di standby', es: 'Estado de espera', pl: 'Stan czuwania', uk: 'Режим очікування', 'zh-cn': '待机状态' },
        spinningSpeed: { ru: 'Скорость отжима', pt: 'Velocidade de centrifugação', nl: 'Centrifugetoerental', fr: 'Vitesse d\'essorage', it: 'Velocità di centrifuga', es: 'Velocidad de centrifugado', pl: 'Prędkość wirowania', uk: 'Швидкість віджиму', 'zh-cn': '脱水转速' },
        dryingStep: { ru: 'Степень сушки (сырое значение)', pt: 'Nível de secagem (valor bruto)', nl: 'Droogstand (ruwe waarde)', fr: 'Niveau de séchage (valeur brute)', it: 'Livello di asciugatura (valore grezzo)', es: 'Nivel de secado (valor bruto)', pl: 'Stopień suszenia (wartość surowa)', uk: 'Ступінь сушіння (сире значення)', 'zh-cn': '烘干程度（原始值）' },
        dryingStepText: { ru: 'Степень сушки', pt: 'Nível de secagem', nl: 'Droogstand', fr: 'Niveau de séchage', it: 'Livello di asciugatura', es: 'Nivel de secado', pl: 'Stopień suszenia', uk: 'Ступінь сушіння', 'zh-cn': '烘干程度' },
        syncState: { ru: 'Состояние синхронизации', pt: 'Estado de sincronização', nl: 'Synchronisatiestatus', fr: 'État de synchronisation', it: 'Stato di sincronizzazione', es: 'Estado de sincronización', pl: 'Stan synchronizacji', uk: 'Стан синхронізації', 'zh-cn': '同步状态' },
        internalState: { ru: 'Внутреннее состояние', pt: 'Estado interno', nl: 'Interne toestand', fr: 'État interne', it: 'Stato interno', es: 'Estado interno', pl: 'Stan wewnętrzny', uk: 'Внутрішній стан', 'zh-cn': '内部状态' },
    },
    info: {
        connected: { ru: 'Подключено / доступно', pt: 'Ligado / acessível', nl: 'Verbonden / bereikbaar', fr: 'Connecté / joignable', it: 'Connesso / raggiungibile', es: 'Conectado / accesible', pl: 'Połączono / osiągalne', uk: 'Підключено / доступно', 'zh-cn': '已连接 / 可达' },
        techType: { ru: 'Тип устройства (техн.)', pt: 'Tipo de aparelho (técnico)', nl: 'Apparaattype (technisch)', fr: 'Type d\'appareil (technique)', it: 'Tipo di apparecchio (tecnico)', es: 'Tipo de aparato (técnico)', pl: 'Typ urządzenia (techniczny)', uk: 'Тип пристрою (техн.)', 'zh-cn': '设备型号（技术）' },
        fabNumber: { ru: 'Серийный номер', pt: 'Número de série', nl: 'Serienummer', fr: 'Numéro de série', it: 'Numero di serie', es: 'Número de serie', pl: 'Numer seryjny', uk: 'Серійний номер', 'zh-cn': '序列号' },
        matNumber: { ru: 'Номер материала', pt: 'Número de material', nl: 'Materiaalnummer', fr: 'Numéro de matériel', it: 'Numero di materiale', es: 'Número de material', pl: 'Numer materiału', uk: 'Номер матеріалу', 'zh-cn': '物料编号' },
        deviceType: { ru: 'Тип устройства', pt: 'Tipo de aparelho', nl: 'Apparaattype', fr: 'Type d\'appareil', it: 'Tipo di apparecchio', es: 'Tipo de aparato', pl: 'Typ urządzenia', uk: 'Тип пристрою', 'zh-cn': '设备类型' },
        xkmType: { ru: 'Тип модуля связи', pt: 'Tipo de módulo de comunicação', nl: 'Type communicatiemodule', fr: 'Type de module de communication', it: 'Tipo di modulo di comunicazione', es: 'Tipo de módulo de comunicación', pl: 'Typ modułu komunikacyjnego', uk: 'Тип модуля зв\'язку', 'zh-cn': '通信模块类型' },
        xkmVersion: { ru: 'Прошивка модуля связи', pt: 'Firmware do módulo de comunicação', nl: 'Firmware communicatiemodule', fr: 'Micrologiciel du module de communication', it: 'Firmware del modulo di comunicazione', es: 'Firmware del módulo de comunicación', pl: 'Oprogramowanie modułu komunikacyjnego', uk: 'Прошивка модуля зв\'язку', 'zh-cn': '通信模块固件' },
        protocolVersion: { ru: 'Версия протокола', pt: 'Versão do protocolo', nl: 'Protocolversie', fr: 'Version du protocole', it: 'Versione del protocollo', es: 'Versión del protocolo', pl: 'Wersja protokołu', uk: 'Версія протоколу', 'zh-cn': '协议版本' },
    },
    control: {
        start: { ru: 'Запустить программу', pt: 'Iniciar programa', nl: 'Programma starten', fr: 'Démarrer le programme', it: 'Avviare il programma', es: 'Iniciar programa', pl: 'Uruchom program', uk: 'Запустити програму', 'zh-cn': '启动程序' },
        stop: { ru: 'Остановить программу', pt: 'Parar programa', nl: 'Programma stoppen', fr: 'Arrêter le programme', it: 'Arrestare il programma', es: 'Detener programa', pl: 'Zatrzymaj program', uk: 'Зупинити програму', 'zh-cn': '停止程序' },
        pause: { ru: 'Приостановить программу', pt: 'Pausar programa', nl: 'Programma pauzeren', fr: 'Mettre le programme en pause', it: 'Mettere in pausa il programma', es: 'Pausar programa', pl: 'Wstrzymaj program', uk: 'Призупинити програму', 'zh-cn': '暂停程序' },
        powerOn: { ru: 'Включить', pt: 'Ligar', nl: 'Inschakelen', fr: 'Allumer', it: 'Accendere', es: 'Encender', pl: 'Włącz', uk: 'Увімкнути', 'zh-cn': '开机' },
        powerOff: { ru: 'Выключить', pt: 'Desligar', nl: 'Uitschakelen', fr: 'Éteindre', it: 'Spegnere', es: 'Apagar', pl: 'Wyłącz', uk: 'Вимкнути', 'zh-cn': '关机' },
        lightOn: { ru: 'Включить освещение', pt: 'Ligar a luz', nl: 'Verlichting aan', fr: 'Allumer l\'éclairage', it: 'Accendere la luce', es: 'Encender la luz', pl: 'Włącz oświetlenie', uk: 'Увімкнути освітлення', 'zh-cn': '开灯' },
        lightOff: { ru: 'Выключить освещение', pt: 'Desligar a luz', nl: 'Verlichting uit', fr: 'Éteindre l\'éclairage', it: 'Spegnere la luce', es: 'Apagar la luz', pl: 'Wyłącz oświetlenie', uk: 'Вимкнути освітлення', 'zh-cn': '关灯' },
    },
};


/**
 * Übersetzungen der Namen, die direkt in main.js gebildet werden (Auswertung, Verlauf,
 * Diagnose). Anders als bei den Datenpunktnamen gibt es hier keinen Kanal/Sub-Schlüssel,
 * deshalb dient der deutsche Text selbst als Schlüssel - er ist im Adapter eindeutig.
 */
const TEXTE = {
    'Auswertung': { ru: 'Статистика', pt: 'Estatísticas', nl: 'Statistieken', fr: 'Statistiques', it: 'Statistiche', es: 'Estadísticas', pl: 'Statystyki', uk: 'Статистика', 'zh-cn': '统计' },
    'Verlauf': { ru: 'История', pt: 'Histórico', nl: 'Geschiedenis', fr: 'Historique', it: 'Cronologia', es: 'Historial', pl: 'Historia', uk: 'Історія', 'zh-cn': '历史记录' },
    'Zeitraum': { ru: 'Период', pt: 'Período', nl: 'Periode', fr: 'Période', it: 'Periodo', es: 'Período', pl: 'Okres', uk: 'Період', 'zh-cn': '时间段' },
    'Vorzeitraum': { ru: 'Предыдущий период', pt: 'Período anterior', nl: 'Vorige periode', fr: 'Période précédente', it: 'Periodo precedente', es: 'Período anterior', pl: 'Poprzedni okres', uk: 'Попередній період', 'zh-cn': '上一时间段' },
    'Woche': { ru: 'Неделя', pt: 'Semana', nl: 'Week', fr: 'Semaine', it: 'Settimana', es: 'Semana', pl: 'Tydzień', uk: 'Тиждень', 'zh-cn': '周' },
    'Monat': { ru: 'Месяц', pt: 'Mês', nl: 'Maand', fr: 'Mois', it: 'Mese', es: 'Mes', pl: 'Miesiąc', uk: 'Місяць', 'zh-cn': '月' },
    'Jahr': { ru: 'Год', pt: 'Ano', nl: 'Jaar', fr: 'Année', it: 'Anno', es: 'Año', pl: 'Rok', uk: 'Рік', 'zh-cn': '年' },
    'Gesamt': { ru: 'Всего', pt: 'Total', nl: 'Totaal', fr: 'Total', it: 'Totale', es: 'Total', pl: 'Łącznie', uk: 'Загалом', 'zh-cn': '总计' },
    'Programme': { ru: 'Программы', pt: 'Ciclos', nl: 'Programma\'s', fr: 'Cycles', it: 'Cicli', es: 'Ciclos', pl: 'Programy', uk: 'Програми', 'zh-cn': '程序次数' },
    'Programme gesamt': { ru: 'Программы, всего', pt: 'Ciclos, total', nl: 'Programma\'s totaal', fr: 'Cycles au total', it: 'Cicli totali', es: 'Ciclos en total', pl: 'Programy łącznie', uk: 'Програми, загалом', 'zh-cn': '程序次数总计' },
    'Programme (Vorzeitraum)': { ru: 'Программы (предыдущий период)', pt: 'Ciclos (período anterior)', nl: 'Programma\'s (vorige periode)', fr: 'Cycles (période précédente)', it: 'Cicli (periodo precedente)', es: 'Ciclos (período anterior)', pl: 'Programy (poprzedni okres)', uk: 'Програми (попередній період)', 'zh-cn': '程序次数（上一时间段）' },
    'Energie': { ru: 'Энергия', pt: 'Energia', nl: 'Energie', fr: 'Énergie', it: 'Energia', es: 'Energía', pl: 'Energia', uk: 'Енергія', 'zh-cn': '电量' },
    'Energie gesamt': { ru: 'Энергия, всего', pt: 'Energia, total', nl: 'Energie totaal', fr: 'Énergie au total', it: 'Energia totale', es: 'Energía en total', pl: 'Energia łącznie', uk: 'Енергія, загалом', 'zh-cn': '电量总计' },
    'Energie (Vorzeitraum)': { ru: 'Энергия (предыдущий период)', pt: 'Energia (período anterior)', nl: 'Energie (vorige periode)', fr: 'Énergie (période précédente)', it: 'Energia (periodo precedente)', es: 'Energía (período anterior)', pl: 'Energia (poprzedni okres)', uk: 'Енергія (попередній період)', 'zh-cn': '电量（上一时间段）' },
    'Energie je Programm': { ru: 'Энергия на программу', pt: 'Energia por ciclo', nl: 'Energie per programma', fr: 'Énergie par cycle', it: 'Energia per ciclo', es: 'Energía por ciclo', pl: 'Energia na program', uk: 'Енергія на програму', 'zh-cn': '每程序电量' },
    'Energie je Programm (Vorzeitraum)': { ru: 'Энергия на программу (предыдущий период)', pt: 'Energia por ciclo (período anterior)', nl: 'Energie per programma (vorige periode)', fr: 'Énergie par cycle (période précédente)', it: 'Energia per ciclo (periodo precedente)', es: 'Energía por ciclo (período anterior)', pl: 'Energia na program (poprzedni okres)', uk: 'Енергія на програму (попередній період)', 'zh-cn': '每程序电量（上一时间段）' },
    'Wasser': { ru: 'Вода', pt: 'Água', nl: 'Water', fr: 'Eau', it: 'Acqua', es: 'Agua', pl: 'Woda', uk: 'Вода', 'zh-cn': '用水量' },
    'Wasser gesamt': { ru: 'Вода, всего', pt: 'Água, total', nl: 'Water totaal', fr: 'Eau au total', it: 'Acqua totale', es: 'Agua en total', pl: 'Woda łącznie', uk: 'Вода, загалом', 'zh-cn': '用水量总计' },
    'Wasser (Vorzeitraum)': { ru: 'Вода (предыдущий период)', pt: 'Água (período anterior)', nl: 'Water (vorige periode)', fr: 'Eau (période précédente)', it: 'Acqua (periodo precedente)', es: 'Agua (período anterior)', pl: 'Woda (poprzedni okres)', uk: 'Вода (попередній період)', 'zh-cn': '用水量（上一时间段）' },
    'Wasser je Programm': { ru: 'Вода на программу', pt: 'Água por ciclo', nl: 'Water per programma', fr: 'Eau par cycle', it: 'Acqua per ciclo', es: 'Agua por ciclo', pl: 'Woda na program', uk: 'Вода на програму', 'zh-cn': '每程序用水量' },
    'Wasser je Programm (Vorzeitraum)': { ru: 'Вода на программу (предыдущий период)', pt: 'Água por ciclo (período anterior)', nl: 'Water per programma (vorige periode)', fr: 'Eau par cycle (période précédente)', it: 'Acqua per ciclo (periodo precedente)', es: 'Agua por ciclo (período anterior)', pl: 'Woda na program (poprzedni okres)', uk: 'Вода на програму (попередній період)', 'zh-cn': '每程序用水量（上一时间段）' },
    'Laufzeit': { ru: 'Время работы', pt: 'Tempo de funcionamento', nl: 'Bedrijfstijd', fr: 'Durée de fonctionnement', it: 'Tempo di funzionamento', es: 'Tiempo de funcionamiento', pl: 'Czas pracy', uk: 'Час роботи', 'zh-cn': '运行时长' },
    'Laufzeit gesamt': { ru: 'Время работы, всего', pt: 'Tempo de funcionamento, total', nl: 'Bedrijfstijd totaal', fr: 'Durée de fonctionnement totale', it: 'Tempo di funzionamento totale', es: 'Tiempo de funcionamiento total', pl: 'Czas pracy łącznie', uk: 'Час роботи, загалом', 'zh-cn': '运行时长总计' },
    'Dauer je Programm': { ru: 'Длительность программы', pt: 'Duração por ciclo', nl: 'Duur per programma', fr: 'Durée par cycle', it: 'Durata per ciclo', es: 'Duración por ciclo', pl: 'Czas trwania programu', uk: 'Тривалість програми', 'zh-cn': '每程序时长' },
    'Laufendes Programm seit': { ru: 'Текущая программа с', pt: 'Ciclo atual desde', nl: 'Lopend programma sinds', fr: 'Cycle en cours depuis', it: 'Ciclo in corso da', es: 'Ciclo actual desde', pl: 'Bieżący program od', uk: 'Поточна програма з', 'zh-cn': '当前程序开始于' },
    'Letzte Programme (JSON)': { ru: 'Последние программы (JSON)', pt: 'Ciclos recentes (JSON)', nl: 'Recente programma\'s (JSON)', fr: 'Cycles récents (JSON)', it: 'Cicli recenti (JSON)', es: 'Ciclos recientes (JSON)', pl: 'Ostatnie programy (JSON)', uk: 'Останні програми (JSON)', 'zh-cn': '最近程序（JSON）' },
    'Monate einzeln (JSON)': { ru: 'Отдельные месяцы (JSON)', pt: 'Meses individuais (JSON)', nl: 'Afzonderlijke maanden (JSON)', fr: 'Mois individuels (JSON)', it: 'Mesi singoli (JSON)', es: 'Meses individuales (JSON)', pl: 'Poszczególne miesiące (JSON)', uk: 'Окремі місяці (JSON)', 'zh-cn': '各月份（JSON）' },
    'Jahre einzeln (JSON)': { ru: 'Отдельные годы (JSON)', pt: 'Anos individuais (JSON)', nl: 'Afzonderlijke jaren (JSON)', fr: 'Années individuelles (JSON)', it: 'Anni singoli (JSON)', es: 'Años individuales (JSON)', pl: 'Poszczególne lata (JSON)', uk: 'Окремі роки (JSON)', 'zh-cn': '各年份（JSON）' },
    'Verbrauch je Programm (JSON)': { ru: 'Расход по программам (JSON)', pt: 'Consumo por programa (JSON)', nl: 'Verbruik per programma (JSON)', fr: 'Consommation par programme (JSON)', it: 'Consumo per programma (JSON)', es: 'Consumo por programa (JSON)', pl: 'Zużycie na program (JSON)', uk: 'Витрати на програму (JSON)', 'zh-cn': '每程序消耗（JSON）' },
    'Fehlerquote der Abfragen': { ru: 'Доля неудачных опросов', pt: 'Taxa de erros de consulta', nl: 'Foutpercentage van opvragingen', fr: 'Taux d\'erreur des interrogations', it: 'Tasso di errore delle interrogazioni', es: 'Tasa de error de consultas', pl: 'Wskaźnik błędów odpytywania', uk: 'Частка невдалих опитувань', 'zh-cn': '轮询错误率' },
    'Fehlerhafte Abfragen (1 h)': { ru: 'Неудачные опросы (1 ч)', pt: 'Consultas falhadas (1 h)', nl: 'Mislukte opvragingen (1 u)', fr: 'Interrogations en échec (1 h)', it: 'Interrogazioni fallite (1 h)', es: 'Consultas fallidas (1 h)', pl: 'Nieudane odpytania (1 h)', uk: 'Невдалі опитування (1 год)', 'zh-cn': '失败轮询（1 小时）' },
    'Abfragen (1 h)': { ru: 'Опросы (1 ч)', pt: 'Consultas (1 h)', nl: 'Opvragingen (1 u)', fr: 'Interrogations (1 h)', it: 'Interrogazioni (1 h)', es: 'Consultas (1 h)', pl: 'Odpytania (1 h)', uk: 'Опитування (1 год)', 'zh-cn': '轮询次数（1 小时）' },
    'Letzter Abfragefehler': { ru: 'Последняя ошибка опроса', pt: 'Último erro de consulta', nl: 'Laatste opvraagfout', fr: 'Dernière erreur d\'interrogation', it: 'Ultimo errore di interrogazione', es: 'Último error de consulta', pl: 'Ostatni błąd odpytywania', uk: 'Остання помилка опитування', 'zh-cn': '最近一次轮询错误' },
    'Startzeit': { ru: 'Время старта', pt: 'Hora de início', nl: 'Starttijd', fr: 'Heure de début', it: 'Ora di avvio', es: 'Hora de inicio', pl: 'Czas startu', uk: 'Час старту', 'zh-cn': '开始时间' },
    'Startzeit (Zeitstempel)': { ru: 'Время старта (метка времени)', pt: 'Hora de início (carimbo de data/hora)', nl: 'Starttijd (tijdstempel)', fr: 'Heure de début (horodatage)', it: 'Ora di avvio (timestamp)', es: 'Hora de inicio (marca de tiempo)', pl: 'Czas startu (znacznik czasu)', uk: 'Час старту (мітка часу)', 'zh-cn': '开始时间（时间戳）' },
    'Energieverbrauch': { ru: 'Энергопотребление', pt: 'Consumo de energia', nl: 'Energieverbruik', fr: 'Consommation d\'énergie', it: 'Consumo energetico', es: 'Consumo de energía', pl: 'Zużycie energii', uk: 'Енергоспоживання', 'zh-cn': '能耗' },
    'Energieverbrauch (Rohwert Wh)': { ru: 'Энергопотребление (исходное значение, Вт·ч)', pt: 'Consumo de energia (valor bruto, Wh)', nl: 'Energieverbruik (ruwe waarde, Wh)', fr: 'Consommation d\'énergie (valeur brute, Wh)', it: 'Consumo energetico (valore grezzo, Wh)', es: 'Consumo de energía (valor bruto, Wh)', pl: 'Zużycie energii (wartość surowa, Wh)', uk: 'Енергоспоживання (необроблене значення, Вт·год)', 'zh-cn': '能耗（原始值，Wh）' },
    'Wasserverbrauch': { ru: 'Расход воды', pt: 'Consumo de água', nl: 'Waterverbruik', fr: 'Consommation d\'eau', it: 'Consumo d\'acqua', es: 'Consumo de agua', pl: 'Zużycie wody', uk: 'Витрата води', 'zh-cn': '用水量' },
    'Laufzeit (Sekunden)': { ru: 'Время работы (секунды)', pt: 'Tempo decorrido (segundos)', nl: 'Looptijd (seconden)', fr: 'Temps écoulé (secondes)', it: 'Tempo trascorso (secondi)', es: 'Tiempo transcurrido (segundos)', pl: 'Czas pracy (sekundy)', uk: 'Час роботи (секунди)', 'zh-cn': '运行时间（秒）' },
    'Restzeit (Sekunden)': { ru: 'Оставшееся время (секунды)', pt: 'Tempo restante (segundos)', nl: 'Resterende tijd (seconden)', fr: 'Temps restant (secondes)', it: 'Tempo rimanente (secondi)', es: 'Tiempo restante (segundos)', pl: 'Pozostały czas (sekundy)', uk: 'Час, що залишився (секунди)', 'zh-cn': '剩余时间（秒）' },
    'Erst im zweiten Versuch geglückt (1 h)': { ru: 'Удалось со второй попытки (1 ч)', pt: 'Bem-sucedido na segunda tentativa (1 h)', nl: 'Pas bij tweede poging gelukt (1 u)', fr: 'Réussi à la seconde tentative (1 h)', it: 'Riuscito al secondo tentativo (1 h)', es: 'Logrado en el segundo intento (1 h)', pl: 'Udało się za drugim razem (1 h)', uk: 'Вдалося з другої спроби (1 год)', 'zh-cn': '第二次尝试成功（1 小时）' },
    'Information': { ru: 'Информация', pt: 'Informação', nl: 'Informatie', fr: 'Informations', it: 'Informazioni', es: 'Información', pl: 'Informacje', uk: 'Інформація', 'zh-cn': '信息' },
    'Zustand': { ru: 'Состояние', pt: 'Estado', nl: 'Status', fr: 'État', it: 'Stato', es: 'Estado', pl: 'Stan', uk: 'Стан', 'zh-cn': '状态' },
    'Steuerung': { ru: 'Управление', pt: 'Controlo', nl: 'Bediening', fr: 'Commande', it: 'Comandi', es: 'Control', pl: 'Sterowanie', uk: 'Керування', 'zh-cn': '控制' },
    'Gerät oder Dienst verbunden': { ru: 'Устройство или служба подключены', pt: 'Dispositivo ou serviço ligado', nl: 'Apparaat of dienst verbonden', fr: 'Appareil ou service connecté', it: 'Dispositivo o servizio connesso', es: 'Dispositivo o servicio conectado', pl: 'Urządzenie lub usługa połączone', uk: 'Пристрій або служба підключені', 'zh-cn': '设备或服务已连接' },
    'Gefundene Geräte (mDNS)': { ru: 'Обнаруженные устройства (mDNS)', pt: 'Dispositivos encontrados (mDNS)', nl: 'Gevonden apparaten (mDNS)', fr: 'Appareils détectés (mDNS)', it: 'Dispositivi rilevati (mDNS)', es: 'Dispositivos detectados (mDNS)', pl: 'Wykryte urządzenia (mDNS)', uk: 'Виявлені пристрої (mDNS)', 'zh-cn': '已发现的设备 (mDNS)' },
};

/**
 * Baut das i18n-Objekt für einen frei gebildeten Namen. Ohne Eintrag in TEXTE bleibt es bei
 * {en, de} - besser eine unvollständige Angabe als eine erfundene Übersetzung.
 */
function text(de, en, german) {
    if (!german) return en;
    return Object.assign({ en, de }, TEXTE[de] || {});
}


/**
 * Geraetekategorien in allen elf Sprachen.
 *
 * Der Geraetename wird zur Laufzeit gebildet - "Waschmaschine - WCR860 (000149933556)". Nur
 * die Kategorie ist uebersetzbar, Modell und Seriennummer sind Eigennamen und bleiben stehen.
 * Deshalb genuegt hier die Kategorie; den Rest haengt geraeteName() unveraendert an.
 */
const KATEGORIEN = {
    'Waschmaschine': { en: 'Washing machine', ru: 'Стиральная машина', pt: 'Máquina de lavar roupa', nl: 'Wasmachine', fr: 'Lave-linge', it: 'Lavatrice', es: 'Lavadora', pl: 'Pralka', uk: 'Пральна машина', 'zh-cn': '洗衣机' },
    'Trockner': { en: 'Tumble dryer', ru: 'Сушильная машина', pt: 'Máquina de secar roupa', nl: 'Droger', fr: 'Sèche-linge', it: 'Asciugatrice', es: 'Secadora', pl: 'Suszarka', uk: 'Сушильна машина', 'zh-cn': '干衣机' },
    'Waschtrockner': { en: 'Washer-dryer', ru: 'Стирально-сушильная машина', pt: 'Máquina de lavar e secar', nl: 'Was-droogcombinatie', fr: 'Lave-linge séchant', it: 'Lavasciuga', es: 'Lavasecadora', pl: 'Pralko-suszarka', uk: 'Пральна машина із сушінням', 'zh-cn': '洗干一体机' },
    'Spülmaschine': { en: 'Dishwasher', ru: 'Посудомоечная машина', pt: 'Máquina de lavar loiça', nl: 'Vaatwasser', fr: 'Lave-vaisselle', it: 'Lavastoviglie', es: 'Lavavajillas', pl: 'Zmywarka', uk: 'Посудомийна машина', 'zh-cn': '洗碗机' },
    'Backofen': { en: 'Oven', ru: 'Духовой шкаф', pt: 'Forno', nl: 'Oven', fr: 'Four', it: 'Forno', es: 'Horno', pl: 'Piekarnik', uk: 'Духова шафа', 'zh-cn': '烤箱' },
    'Backofen mit Mikrowelle': { en: 'Oven with microwave', ru: 'Духовой шкаф с СВЧ', pt: 'Forno com micro-ondas', nl: 'Oven met magnetron', fr: 'Four avec micro-ondes', it: 'Forno con microonde', es: 'Horno con microondas', pl: 'Piekarnik z mikrofalą', uk: 'Духова шафа з мікрохвильовою піччю', 'zh-cn': '微波烤箱' },
    'Dampfgarer': { en: 'Steam oven', ru: 'Пароварка', pt: 'Forno a vapor', nl: 'Stoomoven', fr: 'Cuiseur vapeur', it: 'Forno a vapore', es: 'Horno de vapor', pl: 'Piekarnik parowy', uk: 'Пароварка', 'zh-cn': '蒸箱' },
    'Dampfbackofen': { en: 'Steam combination oven', ru: 'Духовой шкаф с паром', pt: 'Forno combinado a vapor', nl: 'Stoomcombioven', fr: 'Four combiné vapeur', it: 'Forno combinato a vapore', es: 'Horno combinado de vapor', pl: 'Piekarnik parowy kombi', uk: 'Духова шафа з парою', 'zh-cn': '蒸汽烤箱' },
    'Kaffeevollautomat': { en: 'Coffee machine', ru: 'Кофемашина', pt: 'Máquina de café', nl: 'Koffiemachine', fr: 'Machine à café', it: 'Macchina da caffè', es: 'Cafetera automática', pl: 'Ekspres do kawy', uk: 'Кавомашина', 'zh-cn': '全自动咖啡机' },
    'Kühlschrank': { en: 'Refrigerator', ru: 'Холодильник', pt: 'Frigorífico', nl: 'Koelkast', fr: 'Réfrigérateur', it: 'Frigorifero', es: 'Frigorífico', pl: 'Lodówka', uk: 'Холодильник', 'zh-cn': '冰箱' },
    'Gefrierschrank': { en: 'Freezer', ru: 'Морозильник', pt: 'Congelador', nl: 'Vriezer', fr: 'Congélateur', it: 'Congelatore', es: 'Congelador', pl: 'Zamrażarka', uk: 'Морозильник', 'zh-cn': '冷冻柜' },
    'Kühl-Gefrier-Kombination': { en: 'Fridge-freezer', ru: 'Холодильник-морозильник', pt: 'Combinado', nl: 'Koel-vriescombinatie', fr: 'Réfrigérateur-congélateur', it: 'Frigocongelatore', es: 'Combi frigorífico-congelador', pl: 'Chłodziarko-zamrażarka', uk: 'Холодильник-морозильник', 'zh-cn': '冰箱冷冻组合' },
    'Weinkühlschrank': { en: 'Wine cooler', ru: 'Винный шкаф', pt: 'Garrafeira', nl: 'Wijnklimaatkast', fr: 'Cave à vin', it: 'Cantinetta', es: 'Vinoteca', pl: 'Chłodziarka do wina', uk: 'Винна шафа', 'zh-cn': '酒柜' },
    'Dunstabzug': { en: 'Cooker hood', ru: 'Вытяжка', pt: 'Exaustor', nl: 'Afzuigkap', fr: 'Hotte aspirante', it: 'Cappa aspirante', es: 'Campana extractora', pl: 'Okap', uk: 'Витяжка', 'zh-cn': '抽油烟机' },
    'Kochfeld': { en: 'Hob', ru: 'Варочная панель', pt: 'Placa', nl: 'Kookplaat', fr: 'Table de cuisson', it: 'Piano cottura', es: 'Placa de cocción', pl: 'Płyta grzewcza', uk: 'Варильна поверхня', 'zh-cn': '灶具' },
    'Mikrowelle': { en: 'Microwave', ru: 'Микроволновая печь', pt: 'Micro-ondas', nl: 'Magnetron', fr: 'Micro-ondes', it: 'Forno a microonde', es: 'Microondas', pl: 'Kuchenka mikrofalowa', uk: 'Мікрохвильова піч', 'zh-cn': '微波炉' },
    'Wärmeschublade': { en: 'Warming drawer', ru: 'Подогревающий ящик', pt: 'Gaveta de aquecimento', nl: 'Warmhoudlade', fr: 'Tiroir chauffant', it: 'Cassetto scaldavivande', es: 'Cajón calientaplatos', pl: 'Szuflada podgrzewająca', uk: 'Шухляда для підігріву', 'zh-cn': '保温抽屉' },
};

/** Alle Sprachen, die ioBroker fuer common.name empfiehlt. */
const SPRACHEN = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];

/**
 * Geraetename als i18n-Objekt: uebersetzte Kategorie, danach Modell und Seriennummer.
 *
 * Ohne bekannte Kategorie bleibt es beim unveraenderten Text - eine erfundene Uebersetzung
 * waere schlechter als gar keine.
 */
function geraeteName(kategorie, techType, deviceId) {
    const zusatz = techType ? `${techType} (${deviceId})` : `(${deviceId})`;
    if (!kategorie) return techType ? zusatz : deviceId;
    const k = KATEGORIEN[kategorie];
    if (!k) return `${kategorie} - ${zusatz}`;
    const o = {};
    for (const sp of SPRACHEN) o[sp] = `${sp === 'de' ? kategorie : (k[sp] || k.en)} - ${zusatz}`;
    return o;
}

module.exports = { SPRACHNAMEN, TEXTE, KATEGORIEN, SPRACHEN, text, geraeteName };
