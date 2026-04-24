import { useEffect, useState } from 'react';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  toDayKey
} from '../lib/date';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isPastDay(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

function isTodayDay(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime() === today.getTime();
}

function eventSignature(event) {
  return `${event.title}__${event.color}`;
}

export default function MonthGrid({
  month,
  bookedDays,
  blockedDays,
  checkoutDays,
  blockedLabelByDay,
  customEventsByDay,
  selectedDate,
  onSelectDate,
  onSelectRange
}) {
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);

  useEffect(() => {
    function clearDrag() {
      setDragStart(null);
      setDragCurrent(null);
    }

    window.addEventListener('mouseup', clearDrag);
    return () => window.removeEventListener('mouseup', clearDrag);
  }, []);

  function handleMouseDown(date) {
    setDragStart(new Date(date));
    setDragCurrent(new Date(date));
  }

  function handleMouseEnter(date) {
    if (!dragStart) return;
    setDragCurrent(new Date(date));
  }

  function handleMouseUp(date) {
    if (!dragStart) return;
    const startKey = toDayKey(dragStart);
    const end = new Date(date);
    const endKey = toDayKey(end);

    if (startKey === endKey) {
      onSelectDate(end);
    } else {
      onSelectRange(dragStart, end);
    }

    setDragStart(null);
    setDragCurrent(null);
  }

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);

  const cells = [];
  let day = new Date(gridStart);

  while (day <= gridEnd) {
    const cellDate = new Date(day);
    const dayKey = toDayKey(day);
    const prevDayKey = toDayKey(addDays(day, -1));
    const nextDayKey = toDayKey(addDays(day, 1));
    const events = customEventsByDay[dayKey] || [];
    const isBooked = bookedDays.has(dayKey);
    const isBlocked = blockedDays.has(dayKey);
    const isCheckout = checkoutDays.has(dayKey);
    const isPast = isPastDay(day) && !isBooked && !isBlocked;
    const isToday = isTodayDay(day);
    const bookingContinuesFromPrev = bookedDays.has(prevDayKey);
    const bookingContinuesToNext = bookedDays.has(nextDayKey) || checkoutDays.has(nextDayKey);
    const shouldShowCheckoutBand = isCheckout && bookingContinuesFromPrev;
    const showBookedLabel = isBooked && !bookingContinuesFromPrev;
    const blockedContinuesFromPrev = blockedDays.has(prevDayKey);
    const blockedContinuesToNext = blockedDays.has(nextDayKey);
    const isCheckoutBlocked = isBlocked && isCheckout;
    const isSingleDayBlocked = !blockedContinuesFromPrev && !blockedContinuesToNext;
    const shouldShowBlockedBand = isBlocked && !isSingleDayBlocked;
    const blockedLabel = blockedLabelByDay?.[dayKey] || 'Blocked / Cleaning';
    const blockedMobileLabel =
      blockedLabel === 'Cleaning'
        ? 'Clean'
        : blockedLabel === 'Blocked'
          ? 'Block'
          : 'Clean';
    const inCurrentMonth = day.getMonth() === month.getMonth();
    const isSelected = selectedDate && toDayKey(selectedDate) === dayKey;
    const dragStartKey = dragStart ? toDayKey(dragStart) : '';
    const dragCurrentKey = dragCurrent ? toDayKey(dragCurrent) : '';
    const isInDragRange =
      dragStartKey && dragCurrentKey
        ? dayKey >= (dragStartKey < dragCurrentKey ? dragStartKey : dragCurrentKey) &&
          dayKey <= (dragStartKey > dragCurrentKey ? dragStartKey : dragCurrentKey)
        : false;

    const hasEventWithSignature = (key, signature) =>
      (customEventsByDay[key] || []).some((event) => eventSignature(event) === signature);

    cells.push(
      <button
        key={dayKey}
        className={[
          'day-cell',
          inCurrentMonth ? '' : 'day-cell--muted',
          isBooked ? 'day-cell--booked' : '',
          isBlocked ? 'day-cell--blocked' : '',
          isCheckout ? 'day-cell--checkout' : '',
          isPast ? 'day-cell--past' : '',
          isToday ? 'day-cell--today' : '',
          isInDragRange ? 'day-cell--dragging' : '',
          isSelected ? 'day-cell--selected' : ''
        ]
          .filter(Boolean)
          .join(' ')
          .trim()}
        onMouseDown={() => handleMouseDown(cellDate)}
        onMouseEnter={() => handleMouseEnter(cellDate)}
        onMouseUp={() => handleMouseUp(cellDate)}
        type="button"
      >
        {isBooked ? (
          <span
            className={[
              'booking-band',
              bookingContinuesFromPrev ? '' : 'booking-band--start',
              bookingContinuesToNext ? '' : 'booking-band--end'
            ]
              .filter(Boolean)
              .join(' ')
              .trim()}
          />
        ) : null}
        {shouldShowCheckoutBand ? (
          <span
            className={[
              'booking-band',
              'booking-band--checkout',
              bookingContinuesFromPrev ? '' : 'booking-band--start',
              'booking-band--end'
            ]
              .filter(Boolean)
              .join(' ')
              .trim()}
          />
        ) : null}
        {shouldShowBlockedBand ? (
          <span
            className={[
              'blocked-band',
              !isSingleDayBlocked && (blockedContinuesFromPrev && !isCheckoutBlocked ? '' : 'blocked-band--start'),
              !isSingleDayBlocked && (blockedContinuesToNext ? '' : 'blocked-band--end'),
              isCheckoutBlocked ? 'blocked-band--checkout' : ''
            ]
              .filter(Boolean)
              .join(' ')
              .trim()}
          />
        ) : null}
        {events.slice(0, 2).map((event, idx) => {
          const signature = eventSignature(event);
          const continuesFromPrev = hasEventWithSignature(prevDayKey, signature);
          const continuesToNext = hasEventWithSignature(nextDayKey, signature);
          const showLabel = !continuesFromPrev;
          const customBase = isBlocked ? 92 : isBooked || isCheckout ? 66 : 36;

          return (
            <span
              key={event.id}
              className={[
                'custom-band',
                continuesFromPrev ? '' : 'custom-band--start',
                continuesToNext ? '' : 'custom-band--end'
              ]
                .filter(Boolean)
                .join(' ')
                .trim()}
              style={{ '--custom-color': event.color, '--custom-row': idx, '--custom-base': `${customBase}px` }}
              title={event.title}
            >
              {showLabel ? <span className="custom-band__label">{event.title}</span> : null}
            </span>
          );
        })}
        <span className="day-cell__number">{day.getDate()}</span>
        {isToday ? <span className="day-cell__today-marker" aria-hidden="true" /> : null}
        <div className="day-cell__meta">
          {showBookedLabel ? <span className="pill pill--booked">Booked</span> : null}
          {isBlocked ? (
            <span className={`pill pill--blocked${isCheckout ? ' pill--blocked-below-booking' : ''}`}>
              <span className="blocked-label-desktop">{blockedLabel}</span>
              <span className="blocked-label-mobile">{blockedMobileLabel}</span>
            </span>
          ) : null}
          {events.length > 2 ? <span className="event-more">+{events.length - 2} more</span> : null}
        </div>
      </button>
    );

    day = addDays(day, 1);
  }

  return (
    <section className="calendar">
      <header className="weekday-row">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="weekday-cell">
            {weekday}
          </span>
        ))}
      </header>
      <div className="day-grid">{cells}</div>
    </section>
  );
}
