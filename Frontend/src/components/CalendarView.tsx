import React, { useEffect, useMemo, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import frLocale from '@fullcalendar/core/locales/fr';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, EventClickArg, EventInput } from '@fullcalendar/core';

type Props = {
  events: EventInput[];
  selectable: boolean;
  onSelect?: (sel: DateSelectArg) => void;
  onEventClick?: (arg: EventClickArg) => void;
};

// Petite utilité: détecter si mobile via matchMedia
function useIsMobile(breakpointPx = 640) {
  const isMobileRef = useRef<boolean>(false);
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia && window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const handler = () => { isMobileRef.current = mql.matches; setIsMobile(mql.matches); };
    handler();
    mql.addEventListener?.('change', handler);
    return () => mql.removeEventListener?.('change', handler);
  }, [breakpointPx]);
  return isMobile;
}

const CalendarView: React.FC<Props> = ({ events, selectable, onSelect, onEventClick }) => {
  const isMobile = useIsMobile(768);
  // Vue par défaut responsive
  const initialView = isMobile ? 'listWeek' : 'dayGridMonth';
  const header = useMemo(() => ({ left: 'prev,next today', center: 'title', right: isMobile ? 'listWeek,dayGridMonth' : 'dayGridMonth,timeGridWeek,timeGridDay' }), [isMobile]);

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
      views={{
        timeGridWeek: {
          slotMinTime: '00:00:00',
          slotMaxTime: '24:00:00',
          scrollTime: '07:00:00',
          slotDuration: '01:00:00',
          slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
          allDaySlot: false,
        },
        timeGridDay: {
          slotMinTime: '00:00:00',
          slotMaxTime: '24:00:00',
          scrollTime: '07:00:00',
          slotDuration: '01:00:00',
          slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
          allDaySlot: false,
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
