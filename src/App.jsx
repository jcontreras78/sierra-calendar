import { useEffect, useMemo, useState } from 'react';
import MonthGrid from './components/MonthGrid';
import { addMonths, toDayKey } from './lib/date';
import { availabilityDaysFromEvents, parseIcsEvents } from './lib/ics';

const DEFAULT_AIRBNB_ICAL_URL =
  'https://www.airbnb.com/calendar/ical/841293593893351175.ics?';
const STORAGE_KEY = 'sierra-custom-events-v1';
const AIRBNB_CACHE_KEY = 'sierra-airbnb-cache-v1';
const EVENTS_PIN = '74107';

const EVENT_TYPE = {
  NOTE: 'note',
  BOOKING: 'booking',
  BLOCKED: 'blocked',
  CLEANING: 'cleaning',
  HIDE: 'hide'
};

function readStoredEvents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((event) => ({
      ...event,
      eventType: event.eventType || EVENT_TYPE.NOTE,
      overrideTargetType: event.overrideTargetType || ''
    }));
  } catch {
    return [];
  }
}

function readAirbnbCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AIRBNB_CACHE_KEY) || '{}');
    return {
      bookedDays: new Set(Array.isArray(parsed.bookedDays) ? parsed.bookedDays : []),
      blockedDays: new Set(Array.isArray(parsed.blockedDays) ? parsed.blockedDays : []),
      checkoutDays: new Set(Array.isArray(parsed.checkoutDays) ? parsed.checkoutDays : []),
      blockedLabelByDay:
        parsed.blockedLabelByDay && typeof parsed.blockedLabelByDay === 'object' ? parsed.blockedLabelByDay : {}
    };
  } catch {
    return {
      bookedDays: new Set(),
      blockedDays: new Set(),
      checkoutDays: new Set(),
      blockedLabelByDay: {}
    };
  }
}

function writeAirbnbCache({ bookedDays, blockedDays, checkoutDays, blockedLabelByDay }) {
  localStorage.setItem(
    AIRBNB_CACHE_KEY,
    JSON.stringify({
      bookedDays: Array.from(bookedDays),
      blockedDays: Array.from(blockedDays),
      checkoutDays: Array.from(checkoutDays),
      blockedLabelByDay
    })
  );
}

function mergeKeepingPastHistory(cached, fresh) {
  const todayKey = toDayKey(new Date());
  const mergeSet = (cachedSet, freshSet) => {
    const merged = new Set();
    for (const day of cachedSet) {
      if (day < todayKey) merged.add(day);
    }
    for (const day of freshSet) merged.add(day);
    return merged;
  };

  return {
    bookedDays: mergeSet(cached.bookedDays, fresh.bookedDays),
    blockedDays: mergeSet(cached.blockedDays, fresh.blockedDays),
    checkoutDays: mergeSet(cached.checkoutDays, fresh.checkoutDays),
    blockedLabelByDay: (() => {
      const merged = {};
      const blockedUnion = mergeSet(cached.blockedDays, fresh.blockedDays);
      for (const day of blockedUnion) {
        merged[day] = fresh.blockedLabelByDay?.[day] || cached.blockedLabelByDay?.[day] || 'Blocked';
      }
      return merged;
    })()
  };
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

function createEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function normalizeEventTitle(eventType, title) {
  if (eventType === EVENT_TYPE.BOOKING) return 'Booked';
  if (eventType === EVENT_TYPE.BLOCKED) return 'Blocked';
  if (eventType === EVENT_TYPE.CLEANING) return 'Cleaning';
  if (eventType === EVENT_TYPE.HIDE) return 'Hidden';
  return title.trim();
}

function defaultColorForType(type) {
  if (type === EVENT_TYPE.BOOKING) return '#474747';
  if (type === EVENT_TYPE.BLOCKED) return '#f59e0b';
  if (type === EVENT_TYPE.CLEANING) return '#f59e0b';
  if (type === EVENT_TYPE.HIDE) return '#9ca3af';
  return '#2a9d8f';
}

function addDaysToKey(dayKey, offset) {
  const date = new Date(`${dayKey}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return toDayKey(date);
}

function collectContiguousKeys(anchorKey, predicate) {
  if (!predicate(anchorKey)) return [anchorKey];
  const keys = [anchorKey];

  let prev = addDaysToKey(anchorKey, -1);
  while (predicate(prev)) {
    keys.unshift(prev);
    prev = addDaysToKey(prev, -1);
  }

  let next = addDaysToKey(anchorKey, 1);
  while (predicate(next)) {
    keys.push(next);
    next = addDaysToKey(next, 1);
  }

  return keys;
}

export default function App() {
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [modalRange, setModalRange] = useState(null);
  const [bookedDays, setBookedDays] = useState(new Set());
  const [blockedDays, setBlockedDays] = useState(new Set());
  const [checkoutDays, setCheckoutDays] = useState(new Set());
  const [airbnbBlockedLabelByDay, setAirbnbBlockedLabelByDay] = useState({});
  const [error, setError] = useState('');
  const [customEvents, setCustomEvents] = useState(() => readStoredEvents());

  const [isPinUnlocked, setIsPinUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [editingEventId, setEditingEventId] = useState(null);
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('#2a9d8f');
  const [eventType, setEventType] = useState(EVENT_TYPE.NOTE);
  const [overrideTargetType, setOverrideTargetType] = useState('');
  const [showEventForm, setShowEventForm] = useState(false);
  const [rangeStartInput, setRangeStartInput] = useState('');
  const [rangeEndInput, setRangeEndInput] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customEvents));
  }, [customEvents]);

  useEffect(() => {
    async function loadCalendar() {
      setError('');
      const cached = readAirbnbCache();
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
        if (events.length === 0) throw new Error('No events found in Airbnb feed');

        const fresh = availabilityDaysFromEvents(events);
        const merged = mergeKeepingPastHistory(cached, fresh);
        setBookedDays(merged.bookedDays);
        setBlockedDays(merged.blockedDays);
        setCheckoutDays(merged.checkoutDays);
        setAirbnbBlockedLabelByDay(merged.blockedLabelByDay || {});
        writeAirbnbCache(merged);
      } catch (err) {
        setBookedDays(cached.bookedDays);
        setBlockedDays(cached.blockedDays);
        setCheckoutDays(cached.checkoutDays);
        setAirbnbBlockedLabelByDay(cached.blockedLabelByDay || {});
        setError(`Could not load Airbnb iCal feed: ${err?.message || 'Unknown error'}. Showing cached history when available.`);
      }
    }

    loadCalendar();
  }, []);

  const customEventsByDay = useMemo(() => {
    const grouped = {};
    for (const event of customEvents) {
      if ((event.eventType || EVENT_TYPE.NOTE) !== EVENT_TYPE.NOTE) continue;
      if (!grouped[event.date]) grouped[event.date] = [];
      grouped[event.date].push(event);
    }
    return grouped;
  }, [customEvents]);

  const effectiveAvailability = useMemo(() => {
    const effectiveBooked = new Set(bookedDays);
    const effectiveBlocked = new Set(blockedDays);
    const effectiveCheckout = new Set(checkoutDays);
    const blockedLabelByDay = { ...airbnbBlockedLabelByDay };

    const overridesByDay = {};
    for (const event of customEvents) {
      const type = event.eventType || EVENT_TYPE.NOTE;
      if (type === EVENT_TYPE.NOTE) continue;
      if (!overridesByDay[event.date]) overridesByDay[event.date] = [];
      overridesByDay[event.date].push(event);
    }

    for (const [day, dayOverrides] of Object.entries(overridesByDay)) {
      for (const event of dayOverrides) {
        const type = event.eventType || EVENT_TYPE.NOTE;
        if (type === EVENT_TYPE.BOOKING) {
          effectiveBooked.add(day);
          effectiveBlocked.delete(day);
          effectiveCheckout.delete(day);
          delete blockedLabelByDay[day];
        } else if (type === EVENT_TYPE.BLOCKED || type === EVENT_TYPE.CLEANING) {
          effectiveBlocked.add(day);
          effectiveBooked.delete(day);
          effectiveCheckout.delete(day);
          blockedLabelByDay[day] = type === EVENT_TYPE.CLEANING ? 'Cleaning' : 'Blocked';
        }
      }

      for (const event of dayOverrides) {
        const type = event.eventType || EVENT_TYPE.NOTE;
        if (type !== EVENT_TYPE.HIDE) continue;
        const target = event.overrideTargetType;
        if (target === EVENT_TYPE.BOOKING) {
          effectiveBooked.delete(day);
          effectiveCheckout.delete(day);
        } else if (target === EVENT_TYPE.BLOCKED || target === EVENT_TYPE.CLEANING) {
          effectiveBlocked.delete(day);
          delete blockedLabelByDay[day];
        } else {
          effectiveBooked.delete(day);
          effectiveBlocked.delete(day);
          effectiveCheckout.delete(day);
          delete blockedLabelByDay[day];
        }
      }
    }

    return { bookedDays: effectiveBooked, blockedDays: effectiveBlocked, checkoutDays: effectiveCheckout, blockedLabelByDay };
  }, [bookedDays, blockedDays, checkoutDays, airbnbBlockedLabelByDay, customEvents]);

  const activeDate = modalRange?.start || selectedDate;
  const activeDayKey = toDayKey(activeDate);
  const isRangeMode = Boolean(modalRange && toDayKey(modalRange.start) !== toDayKey(modalRange.end));

  const activeDayEvents = customEvents.filter((event) => event.date === activeDayKey);
  const activeDayOverrideEvents = activeDayEvents.filter((event) => (event.eventType || EVENT_TYPE.NOTE) !== EVENT_TYPE.NOTE);
  const activeDayNoteEvents = activeDayEvents.filter((event) => (event.eventType || EVENT_TYPE.NOTE) === EVENT_TYPE.NOTE);

  const hiddenOverrideByTargetType = useMemo(() => {
    const byType = {};
    for (const event of activeDayOverrideEvents) {
      if (event.eventType !== EVENT_TYPE.HIDE) continue;
      if (event.overrideTargetType && !byType[event.overrideTargetType]) byType[event.overrideTargetType] = event;
    }
    return byType;
  }, [activeDayOverrideEvents]);

  const availableOverrideTypes = useMemo(() => {
    const types = [];
    const hasBooking =
      effectiveAvailability.bookedDays.has(activeDayKey) || effectiveAvailability.checkoutDays.has(activeDayKey);
    if (hasBooking) types.push(EVENT_TYPE.BOOKING);

    if (effectiveAvailability.blockedDays.has(activeDayKey)) {
      const label = effectiveAvailability.blockedLabelByDay?.[activeDayKey];
      if (label === 'Cleaning') {
        types.push(EVENT_TYPE.CLEANING);
      } else {
        types.push(EVENT_TYPE.BLOCKED);
      }
    }

    return types;
  }, [activeDayKey, effectiveAvailability]);

  const overrideTypesForModal = useMemo(() => {
    const set = new Set(availableOverrideTypes);
    for (const targetType of Object.keys(hiddenOverrideByTargetType)) {
      if (targetType) set.add(targetType);
    }
    return Array.from(set);
  }, [availableOverrideTypes, hiddenOverrideByTargetType]);

  function resetEventForm() {
    setEditingEventId(null);
    setTitle('');
    setColor('#2a9d8f');
    setEventType(EVENT_TYPE.NOTE);
    setOverrideTargetType('');
    setShowEventForm(false);
    const start = modalRange?.start || selectedDate;
    const end = modalRange?.end || selectedDate;
    setRangeStartInput(toDayKey(start));
    setRangeEndInput(toDayKey(end));
  }

  function openDayModal(date) {
    if (!isPinUnlocked) return;
    setSelectedDate(date);
    setModalRange({ start: new Date(date), end: new Date(date) });
    resetEventForm();
    setRangeStartInput(toDayKey(date));
    setRangeEndInput(toDayKey(date));
  }

  function openRangeModal(startDate, endDate) {
    if (!isPinUnlocked) return;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const [from, to] = start <= end ? [start, end] : [end, start];
    setSelectedDate(from);
    setModalRange({ start: from, end: to });
    resetEventForm();
    setRangeStartInput(toDayKey(from));
    setRangeEndInput(toDayKey(to));
  }

  function closeDayModal() {
    setModalRange(null);
    resetEventForm();
  }

  function toggleLock() {
    if (isPinUnlocked) {
      setIsPinUnlocked(false);
      resetEventForm();
      return;
    }
    setPinInput('');
    setPinError('');
    setShowPinModal(true);
  }

  function submitPin(e) {
    e.preventDefault();
    if (pinInput === EVENTS_PIN) {
      setIsPinUnlocked(true);
      setShowPinModal(false);
      setPinInput('');
      setPinError('');
      return;
    }
    setPinError('Incorrect PIN');
  }

  function startEditEvent(event) {
    if (!isPinUnlocked) return;
    const type = event.eventType || EVENT_TYPE.NOTE;
    setEditingEventId(event.id);
    setTitle(event.title);
    setColor(type === EVENT_TYPE.NOTE ? event.color : defaultColorForType(type));
    setEventType(type);
    setOverrideTargetType(event.overrideTargetType || '');
    setShowEventForm(true);
    setRangeStartInput(event.date);
    setRangeEndInput(event.date);
  }

  function startCreateEvent(type, targetType = '') {
    if (!isPinUnlocked) return;
    setEditingEventId(null);
    setEventType(type);
    setOverrideTargetType(targetType);
    setTitle(type === EVENT_TYPE.NOTE ? '' : normalizeEventTitle(type, ''));
    const existingSameType = activeDayOverrideEvents.find((event) => (event.eventType || EVENT_TYPE.NOTE) === type);
    setColor(existingSameType?.color || defaultColorForType(type));
    setShowEventForm(true);
    const start = modalRange?.start || selectedDate;
    const end = modalRange?.end || selectedDate;
    setRangeStartInput(toDayKey(start));
    setRangeEndInput(toDayKey(end));
  }

  function removeCustomEvent(eventToRemove) {
    if (!isPinUnlocked) {
      window.alert('Unlock calendar editing first');
      return;
    }
    setCustomEvents((events) =>
      events.filter((event) =>
        eventToRemove.seriesId ? event.seriesId !== eventToRemove.seriesId : event.id !== eventToRemove.id
      )
    );
    if (editingEventId === eventToRemove.id) resetEventForm();
  }

  function restoreOverride(eventToRestore) {
    if (!eventToRestore) return;
    removeCustomEvent(eventToRestore);
    resetEventForm();
  }

  function applyImmediateHide(targetType) {
    if (!isPinUnlocked) return;
    const dayKey = activeDayKey;
    const predicate = (key) => {
      if (targetType === EVENT_TYPE.BOOKING) {
        return effectiveAvailability.bookedDays.has(key) || effectiveAvailability.checkoutDays.has(key);
      }
      if (targetType === EVENT_TYPE.BLOCKED) {
        return effectiveAvailability.blockedDays.has(key) && effectiveAvailability.blockedLabelByDay[key] !== 'Cleaning';
      }
      if (targetType === EVENT_TYPE.CLEANING) {
        return effectiveAvailability.blockedDays.has(key) && effectiveAvailability.blockedLabelByDay[key] === 'Cleaning';
      }
      return false;
    };

    const targetKeys = collectContiguousKeys(dayKey, predicate);
    const seriesId = createEventId();
    const hideEvents = targetKeys.map((key) => ({
      id: createEventId(),
      seriesId,
      title: normalizeEventTitle(EVENT_TYPE.HIDE, ''),
      color: defaultColorForType(EVENT_TYPE.HIDE),
      eventType: EVENT_TYPE.HIDE,
      overrideTargetType: targetType,
      date: key
    }));

    setCustomEvents((events) => [
      ...events.filter(
        (event) =>
          !(
            targetKeys.includes(event.date) &&
            event.eventType === EVENT_TYPE.HIDE &&
            event.overrideTargetType === targetType
          )
      ),
      ...hideEvents
    ]);
  }

  function saveCustomEvent(e) {
    e.preventDefault();
    if (!isPinUnlocked) {
      window.alert('Unlock calendar editing first');
      return;
    }
    if (eventType === EVENT_TYPE.NOTE && !title.trim()) return;

    const normalizedTitle = normalizeEventTitle(eventType, title);
    const resolvedColor = eventType === EVENT_TYPE.NOTE ? color : defaultColorForType(eventType);

    if (editingEventId) {
      setCustomEvents((events) =>
        events.map((event) =>
          event.id === editingEventId
            ? {
                ...event,
                title: normalizedTitle,
                color: resolvedColor,
                eventType,
                overrideTargetType: eventType === EVENT_TYPE.HIDE ? overrideTargetType : ''
              }
            : event
        )
      );
    } else {
      const defaultStart = modalRange?.start || activeDate;
      const defaultEnd = modalRange?.end || activeDate;
      const pickedStart = rangeStartInput ? new Date(`${rangeStartInput}T00:00:00`) : defaultStart;
      const pickedEnd = rangeEndInput ? new Date(`${rangeEndInput}T00:00:00`) : defaultEnd;
      const [rangeStart, rangeEnd] = pickedStart <= pickedEnd ? [pickedStart, pickedEnd] : [pickedEnd, pickedStart];
      const dates = [];
      const d = new Date(rangeStart);
      const seriesId = createEventId();
      while (d <= rangeEnd) {
        dates.push(toDayKey(d));
        d.setDate(d.getDate() + 1);
      }

      setCustomEvents((events) => [
        ...events,
        ...dates.map((dateKey) => ({
          id: createEventId(),
          seriesId,
          title: normalizedTitle,
          color: resolvedColor,
          eventType,
          overrideTargetType: eventType === EVENT_TYPE.HIDE ? overrideTargetType : '',
          date: dateKey
        }))
      ]);
    }

    resetEventForm();
  }

  const monthLabel = month.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });

  const modalLabel = modalRange
    ? isRangeMode
      ? `${modalRange.start.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })} - ${modalRange.end.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })}`
      : modalRange.start.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        })
    : '';

  return (
    <main className="page">
      <button
        type="button"
        className="calendar-lock-toggle"
        onClick={toggleLock}
        aria-label={isPinUnlocked ? 'Lock calendar' : 'Unlock calendar'}
        title={isPinUnlocked ? 'Lock calendar' : 'Unlock calendar'}
      >
        <i className={isPinUnlocked ? 'fa-solid fa-lock-open' : 'fa-solid fa-lock'} aria-hidden="true" />
      </button>

      <section className="shell">
        <header className="topbar">
          <h1>11215 Sierra Calendar</h1>
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
          bookedDays={effectiveAvailability.bookedDays}
          blockedDays={effectiveAvailability.blockedDays}
          checkoutDays={effectiveAvailability.checkoutDays}
          blockedLabelByDay={effectiveAvailability.blockedLabelByDay}
          customEventsByDay={customEventsByDay}
          selectedDate={selectedDate}
          onSelectDate={openDayModal}
          onSelectRange={openRangeModal}
        />

        {error ? <p className="error">{error}</p> : null}
      </section>

      {modalRange ? (
        <div className="modal-overlay" role="presentation" onClick={closeDayModal}>
          <section className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header className="modal__header">
              <h2>{modalLabel}</h2>
              <button type="button" onClick={closeDayModal}>
                Close
              </button>
            </header>
            {isRangeMode ? <p className="muted">Adding an event will apply to every selected day in this range.</p> : null}

            <form className="event-form" onSubmit={saveCustomEvent}>
              {!showEventForm ? (
                <div className="override-options">
                  {overrideTypesForModal.includes(EVENT_TYPE.BOOKING) ? (
                    <div className="event-row">
                      <input className="event-color-chip" type="color" value={defaultColorForType(EVENT_TYPE.BOOKING)} readOnly disabled />
                      <span>Booking</span>
                      <button type="button" onClick={() => startCreateEvent(EVENT_TYPE.BOOKING)}>
                        Edit
                      </button>
                      {hiddenOverrideByTargetType[EVENT_TYPE.BOOKING] ? (
                        <button type="button" onClick={() => restoreOverride(hiddenOverrideByTargetType[EVENT_TYPE.BOOKING])}>
                          Show
                        </button>
                      ) : (
                        <button type="button" onClick={() => applyImmediateHide(EVENT_TYPE.BOOKING)}>
                          Hide
                        </button>
                      )}
                    </div>
                  ) : null}

                  {overrideTypesForModal.includes(EVENT_TYPE.BLOCKED) ? (
                    <div className="event-row">
                      <input className="event-color-chip" type="color" value={defaultColorForType(EVENT_TYPE.BLOCKED)} readOnly disabled />
                      <span>Blocked</span>
                      <button type="button" onClick={() => startCreateEvent(EVENT_TYPE.BLOCKED)}>
                        Edit
                      </button>
                      {hiddenOverrideByTargetType[EVENT_TYPE.BLOCKED] ? (
                        <button type="button" onClick={() => restoreOverride(hiddenOverrideByTargetType[EVENT_TYPE.BLOCKED])}>
                          Show
                        </button>
                      ) : (
                        <button type="button" onClick={() => applyImmediateHide(EVENT_TYPE.BLOCKED)}>
                          Hide
                        </button>
                      )}
                    </div>
                  ) : null}

                  {overrideTypesForModal.includes(EVENT_TYPE.CLEANING) ? (
                    <div className="event-row">
                      <input className="event-color-chip" type="color" value={defaultColorForType(EVENT_TYPE.CLEANING)} readOnly disabled />
                      <span>Cleaning</span>
                      <button type="button" onClick={() => startCreateEvent(EVENT_TYPE.CLEANING)}>
                        Edit
                      </button>
                      {hiddenOverrideByTargetType[EVENT_TYPE.CLEANING] ? (
                        <button type="button" onClick={() => restoreOverride(hiddenOverrideByTargetType[EVENT_TYPE.CLEANING])}>
                          Show
                        </button>
                      ) : (
                        <button type="button" onClick={() => applyImmediateHide(EVENT_TYPE.CLEANING)}>
                          Hide
                        </button>
                      )}
                    </div>
                  ) : null}

                  <button type="button" onClick={() => startCreateEvent(EVENT_TYPE.NOTE)}>
                    Add New Event
                  </button>
                </div>
              ) : null}

              {showEventForm ? (
                <div className="event-form-fields">
                  <div className="override-range-fields">
                    <label>
                      Start
                      <input
                        type="date"
                        value={rangeStartInput}
                        onChange={(e) => setRangeStartInput(e.target.value)}
                        disabled={!isPinUnlocked}
                      />
                    </label>
                    <label>
                      End
                      <input
                        type="date"
                        value={rangeEndInput}
                        onChange={(e) => setRangeEndInput(e.target.value)}
                        disabled={!isPinUnlocked}
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    placeholder={eventType === EVENT_TYPE.NOTE ? 'Event title' : 'Auto title from event type'}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={!isPinUnlocked || eventType !== EVENT_TYPE.NOTE}
                  />
                  <label>
                    Color
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      disabled={!isPinUnlocked || eventType !== EVENT_TYPE.NOTE}
                    />
                  </label>
                  <button type="submit">Save</button>
                  <button type="button" onClick={resetEventForm}>
                    Cancel
                  </button>
                  {eventType !== EVENT_TYPE.NOTE ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!editingEventId) {
                          resetEventForm();
                          return;
                        }
                        const current = activeDayOverrideEvents.find((e) => e.id === editingEventId);
                        restoreOverride(current);
                      }}
                    >
                      Restore
                    </button>
                  ) : null}
                </div>
              ) : null}
            </form>

            {!isRangeMode ? (
              <div className="event-list">
                {activeDayNoteEvents.length === 0 ? <p className="muted">No custom events for this day.</p> : null}
                {activeDayNoteEvents.map((event) => (
                  <div key={event.id} className="event-row">
                    <input className="event-color-chip" type="color" value={event.color} readOnly disabled />
                    <span>{event.title}</span>
                    <button type="button" onClick={() => startEditEvent(event)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => removeCustomEvent(event)}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {showPinModal ? (
        <div className="modal-overlay" role="presentation" onClick={() => setShowPinModal(false)}>
          <section className="modal pin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header className="modal__header">
              <h2>Unlock Calendar</h2>
              <button type="button" onClick={() => setShowPinModal(false)}>
                Close
              </button>
            </header>
            <form className="pin-form" onSubmit={submitPin}>
              <input
                type="password"
                placeholder="Enter PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
              />
              <button type="submit">Unlock</button>
            </form>
            {pinError ? <p className="error">{pinError}</p> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
