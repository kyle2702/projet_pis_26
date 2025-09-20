import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import frLocale from '@fullcalendar/core/locales/fr';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, EventClickArg, EventInput } from '@fullcalendar/core';
import './CalendarView.css';

type Props = {
  events: EventInput[];
  selectable: boolean;
  onSelect?: (sel: DateSelectArg) => void;
  onEventClick?: (arg: EventClickArg) => void;
};

const CalendarView: React.FC<Props> = ({ events, selectable, onSelect, onEventClick }) => {
  // Forcer une vue identique à desktop, l'ajustement mobile se fait via CSS responsif
  const initialView = 'dayGridMonth';
  const header = { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' } as const;

  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      headerToolbar={header}
      initialView={initialView}
      locales={[frLocale]}
      locale="fr"
      firstDay={1}
      selectable={selectable}
      selectMirror
      weekends
  expandRows
      views={{
        timeGridWeek: {
          slotMinTime: '00:00:00',
          slotMaxTime: '24:00:00',
          scrollTime: '07:00:00',
          slotDuration: '01:00:00',
          slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
          allDaySlot: true,
        },
        timeGridDay: {
          slotMinTime: '00:00:00',
          slotMaxTime: '24:00:00',
          scrollTime: '07:00:00',
          slotDuration: '01:00:00',
          slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
          allDaySlot: true,
        },
      }}
      eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
      events={events}
      select={onSelect}
      eventClick={onEventClick}
      height="auto"
    />
  );
};

export default CalendarView;
