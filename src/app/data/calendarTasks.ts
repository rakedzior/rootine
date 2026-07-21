export type CalendarTaskData = {
  id: number;
  calendarDate: string;
  dateLabel: string;
  text: string;
  done: boolean;
  time?: string;
  list: string;
  tags: string[];
};

export const CALENDAR_TASKS: CalendarTaskData[] = [
  { id: 101, calendarDate: "2026-07-20", dateLabel: "pon., 20 lip", text: "Taniec", done: false, time: "18:00", list: "hobby", tags: ["hobby"] },
  { id: 102, calendarDate: "2026-07-21", dateLabel: "wt., 21 lip", text: "Fryzjer - Mardosz Group", done: false, time: "15:00", list: "hobby", tags: ["hobby"] },
  { id: 103, calendarDate: "2026-07-22", dateLabel: "śr., 22 lip", text: "Taniec", done: false, time: "17:00", list: "hobby", tags: ["hobby"] },
  { id: 104, calendarDate: "2026-07-22", dateLabel: "śr., 22 lip", text: "Wojtek Zaproszenie", done: false, time: "18:30", list: "dom", tags: ["dom"] },
  { id: 105, calendarDate: "2026-07-24", dateLabel: "pt., 24 lip", text: "Globisz Gosia - mamy 1.5h dla nich xd", done: false, time: "19:30", list: "hobby", tags: ["hobby"] },
  { id: 106, calendarDate: "2026-07-25", dateLabel: "sob., 25 lip", text: "Wesele Mati & Wiglusz", done: false, list: "dom", tags: ["dom"] },
  { id: 107, calendarDate: "2026-07-26", dateLabel: "niedz., 26 lip", text: "Kędziory wizyta zaproszenia", done: false, list: "dom", tags: ["dom"] },
  { id: 108, calendarDate: "2026-07-27", dateLabel: "pon., 27 lip", text: "Taniec", done: false, time: "18:00", list: "hobby", tags: ["hobby"] },
  { id: 109, calendarDate: "2026-07-28", dateLabel: "wt., 28 lip", text: "Andre Grand - Przymiarki", done: false, time: "18:00", list: "hobby", tags: ["hobby"] },
  { id: 110, calendarDate: "2026-07-28", dateLabel: "wt., 28 lip", text: "Klaudia zaprasza gości", done: false, time: "20:00", list: "dom", tags: ["dom"] },
  { id: 111, calendarDate: "2026-07-29", dateLabel: "śr., 29 lip", text: "Taniec", done: false, time: "20:00", list: "hobby", tags: ["hobby"] },
];
