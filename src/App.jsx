import { useEffect, useMemo, useState } from 'react';
import MonthGrid from './components/MonthGrid';
import { addMonths, toDayKey } from './lib/date';
import { availabilityDaysFromEvents, parseIcsEvents } from './lib/ics';

const DEFAULT_AIRBNB_ICAL_URL =
  'https://www.airbnb.com/calendar/ical/841293593893351175.ics?';
const STORAGE_KEY = 'sierra-custom-events-v1';
const EVENTS_PIN = '74107';

function readStoredEvents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toLocalIcalProxyUrl(fullFeedUrl) {
  try {
    const parsed = new URL(fullFeedUrl);
    const path = parsed.pathname.replace(/^\/calendar\/ical\//, '');
    return `/api/airbnb-ical/${path}${parsed.search}`;
  } catch {
    return '';
  }
}

export default function App() {
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [modalDate, setModalDate] = useState(null);
  const [bookedDays, setBookedDays] = useState(new Set());
  const [blockedDays, setBlockedDays] = useState(new Set());
  const [checkoutDays, setCheckoutDays] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [customEvents, setCustomEvents] = useState(() => readStoredEvents());

  const [isPinUnlocked, setIsPinUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [editingEventId, setEditingEventId] = useState(null);
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('#2a9d8f');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customEvents));
  }, [customEvents]);

  useEffect(() => {
    async function loadCalendar() {
      setIsLoading(true);
      setError('');
      try {
        const feedUrl = import.meta.env.VITE_AIRBNB_ICAL_URL || DEFAULT_AIRBNB_ICAL_URL;
        if (!import.meta.env.VITE_AIRBNB_ICAL_URL) {
          throw new Error('Missing VITE_AIRBNB_ICAL_URL in .env');
        }
        const url = toLocalIcalProxyUrl(feedUrl);
        if (!url) throw new Error('Invalid Airbnb iCal URL');

        const res = await fetch(url);
        if (!res.ok) throw new Error(`iCal fetch failed (${res.status})`);

        const text = await res.text();
        const events = parseIcsEvents(text);
        if (events.length === 0) {
          throw new Error('No events found in Airbnb feed');
        }
        const {
          bookedDays: booked,
          blockedDays: blocked,
          checkoutDays: checkout
        } = availabilityDaysFromEvents(events);
        setBookedDays(booked);
        setBlockedDays(blocked);
        setCheckoutDays(checkout);
      } catch (err) {
        setError(
          `Could not load Airbnb iCal feed: ${err?.message || 'Unknown error'}. Make sure VITE_AIRBNB_ICAL_URL is the full private Airbnb export URL (including Airbnb token query like ?t=... or ?s=...).`
        );
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    loadCalendar();
  }, []);

  const customEventsByDay = useMemo(() => {
    const grouped = {};
    for (const event of customEvents) {
      if (!grouped[event.date]) grouped[event.date] = [];
      grouped[event.date].push(event);
    }
    return grouped;
  }, [customEvents]);

  const activeDate = modalDate || selectedDate;
  const activeDayKey = toDayKey(activeDate);
  const activeDayEvents = customEventsByDay[activeDayKey] || [];

  function resetEventForm() {
    setEditingEventId(null);
    setTitle('');
    setColor('#2a9d8f');
  }

  function openDayModal(date) {
    setSelectedDate(date);
    setModalDate(date);
    resetEventForm();
    setPinError('');
  }

  function closeDayModal() {
    setModalDate(null);
    resetEventForm();
    setPinError('');
    setPinInput('');
  }

  function unlockPin(e) {
    e.preventDefault();
    if (pinInput === EVENTS_PIN) {
      setIsPinUnlocked(true);
      setPinError('');
      return;
    }
    setPinError('Incorrect PIN');
  }

  function lockPin() {
    setIsPinUnlocked(false);
    setPinInput('');
    setPinError('');
    resetEventForm();
  }

  function startEditEvent(event) {
    if (!isPinUnlocked) return;
    setEditingEventId(event.id);
    setTitle(event.title);
    setColor(event.color);
  }

  function saveCustomEvent(e) {
    e.preventDefault();
    if (!isPinUnlocked) {
      setPinError('Enter PIN to modify events');
      return;
    }
    if (!title.trim()) return;

    if (editingEventId) {
      setCustomEvents((events) =>
        events.map((event) =>
          event.id === editingEventId
            ? {
                ...event,
                title: title.trim(),
                color
              }
            : event
        )
      );
    } else {
      setCustomEvents((events) => [
        ...events,
        {
          id: crypto.randomUUID(),
          title: title.trim(),
          color,
          date: activeDayKey
        }
      ]);
    }

    resetEventForm();
  }

  function removeCustomEvent(id) {
    if (!isPinUnlocked) {
      setPinError('Enter PIN to modify events');
      return;
    }
    setCustomEvents((events) => events.filter((event) => event.id !== id));
    if (editingEventId === id) resetEventForm();
  }

  const monthLabel = month.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });

  const modalLabel = modalDate
    ? modalDate.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    : '';

  return (
    <main className="page">
      <section className="shell">
        <header className="topbar">
          <h1>Availability Calendar</h1>
          <div className="controls">
            <button type="button" onClick={() => setMonth(addMonths(month, -1))}>
              Prev
            </button>
            <p>{monthLabel}</p>
            <button type="button" onClick={() => setMonth(addMonths(month, 1))}>
              Next
            </button>
          </div>
        </header>

        <MonthGrid
          month={month}
          bookedDays={bookedDays}
          blockedDays={blockedDays}
          checkoutDays={checkoutDays}
          customEventsByDay={customEventsByDay}
          selectedDate={selectedDate}
          onSelectDate={openDayModal}
        />

        <section className="panel-grid">
          <article className="panel">
            <h2>Airbnb sync</h2>
            <p className="muted">Feed URL: from VITE_AIRBNB_ICAL_URL</p>
            <p className="muted">Click any day to open event modal.</p>
            {isLoading ? <p>Loading bookings...</p> : null}
            {error ? <p className="error">{error}</p> : null}
            {!isLoading && !error ? (
              <>
                <p>
                  Loaded booked nights: <strong>{bookedDays.size}</strong>
                </p>
                <p>
                  Loaded blocked/cleaning nights: <strong>{blockedDays.size}</strong>
                </p>
              </>
            ) : null}
          </article>
        </section>
      </section>

      {modalDate ? (
        <div className="modal-overlay" role="presentation" onClick={closeDayModal}>
          <section className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header className="modal__header">
              <h2>{modalLabel}</h2>
              <button type="button" onClick={closeDayModal}>
                Close
              </button>
            </header>

            <div className="pin-row">
              {!isPinUnlocked ? (
                <form className="pin-form" onSubmit={unlockPin}>
                  <input
                    type="password"
                    placeholder="Enter PIN"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                  />
                  <button type="submit">Unlock</button>
                </form>
              ) : (
                <div className="pin-unlocked">
                  <span>Events unlocked</span>
                  <button type="button" onClick={lockPin}>
                    Lock
                  </button>
                </div>
              )}
              {pinError ? <p className="error">{pinError}</p> : null}
            </div>

            <form className="event-form" onSubmit={saveCustomEvent}>
              <input
                type="text"
                placeholder="Event title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!isPinUnlocked}
              />
              <label>
                Color
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  disabled={!isPinUnlocked}
                />
              </label>
              <button type="submit" disabled={!isPinUnlocked}>
                {editingEventId ? 'Save changes' : 'Add event'}
              </button>
              {editingEventId ? (
                <button type="button" onClick={resetEventForm} disabled={!isPinUnlocked}>
                  Cancel edit
                </button>
              ) : null}
            </form>

            <div className="event-list">
              {activeDayEvents.length === 0 ? <p className="muted">No custom events for this day.</p> : null}
              {activeDayEvents.map((event) => (
                <div key={event.id} className="event-row">
                  <span className="event-dot" style={{ background: event.color }} />
                  <span>{event.title}</span>
                  <button type="button" onClick={() => startEditEvent(event)} disabled={!isPinUnlocked}>
                    Edit
                  </button>
                  <button type="button" onClick={() => removeCustomEvent(event.id)} disabled={!isPinUnlocked}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
