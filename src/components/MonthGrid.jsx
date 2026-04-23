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

export default function MonthGrid({
  month,
  bookedDays,
  blockedDays,
  checkoutDays,
  customEventsByDay,
  selectedDate,
  onSelectDate
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);

  const cells = [];
  let day = new Date(gridStart);

  while (day <= gridEnd) {
    const dayKey = toDayKey(day);
    const prevDayKey = toDayKey(addDays(day, -1));
    const nextDayKey = toDayKey(addDays(day, 1));
    const events = customEventsByDay[dayKey] || [];
    const isBooked = bookedDays.has(dayKey);
    const isBlocked = blockedDays.has(dayKey);
    const isCheckout = checkoutDays.has(dayKey);
    const isPast = isPastDay(day) && !isBooked && !isBlocked;
    const bookingContinuesFromPrev = bookedDays.has(prevDayKey);
    const bookingContinuesToNext = bookedDays.has(nextDayKey) || checkoutDays.has(nextDayKey);
    const showBookedLabel = isBooked && !bookingContinuesFromPrev;
    const blockedContinuesFromPrev = blockedDays.has(prevDayKey);
    const blockedContinuesToNext = blockedDays.has(nextDayKey);
    const isCheckoutBlocked = isBlocked && isCheckout;
    const isSingleDayBlocked = !blockedContinuesFromPrev && !blockedContinuesToNext;
    const shouldShowBlockedBand = isBlocked && !isSingleDayBlocked;
    const inCurrentMonth = day.getMonth() === month.getMonth();
    const isSelected = selectedDate && toDayKey(selectedDate) === dayKey;

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
          isSelected ? 'day-cell--selected' : ''
        ]
          .filter(Boolean)
          .join(' ')
          .trim()}
        onClick={() => onSelectDate(new Date(day))}
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
        {isCheckout ? (
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
        <span className="day-cell__number">{day.getDate()}</span>
        <div className="day-cell__meta">
          {showBookedLabel ? <span className="pill pill--booked">Booked</span> : null}
          {isBlocked ? (
            <span className={`pill pill--blocked${isCheckout ? ' pill--blocked-below-booking' : ''}`}>
              Blocked / Cleaning
            </span>
          ) : null}
          {events.slice(0, 2).map((event) => (
            <span
              key={event.id}
              className="event-pill"
              style={{ '--event-color': event.color }}
              title={event.title}
            >
              {event.title}
            </span>
          ))}
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
