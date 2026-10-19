import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { NumberTicker } from '../src/components/magic/number-ticker';

/*
 * Crash containment.
 *
 * A thrown error inside render unmounts the entire React tree — on a phone that
 * is indistinguishable from the app closing. These tests pin the two defences:
 * the boundary around every screen, and the ticker's tolerance of a missing
 * metric (the exact payload that used to blank the admin dashboard).
 */

function Boom(): never {
  throw new Error('The widget exploded');
}

afterEach(() => vi.restoreAllMocks());

describe('ErrorBoundary', () => {
  it('renders children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('shows a readable card with the real error instead of a blank screen', () => {
    /* React logs the caught error; keep the test output readable. */
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/ran into a problem/i)).toBeInTheDocument();
    expect(screen.getByText('The widget exploded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload the app/i })).toBeInTheDocument();
  });

  it('shows a fallback message when the error carries no message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Silent = () => {
      throw new Error('');
    };
    render(
      <ErrorBoundary>
        <Silent />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/unexpected error occurred/i)).toBeInTheDocument();
  });
});

describe('NumberTicker', () => {
  it('formats a normal figure', () => {
    render(<NumberTicker value={1234567} />);
    expect(screen.getByText('12,34,567')).toBeInTheDocument();
  });

  it('honours prefix, suffix and decimals', () => {
    render(<NumberTicker value={12.5} prefix="₹" suffix=" off" decimals={2} />);
    expect(screen.getByText('₹12.50 off')).toBeInTheDocument();
  });

  it('renders zero for a missing or non-numeric metric rather than throwing', () => {
    render(<NumberTicker value={undefined as unknown as number} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    render(<NumberTicker value={Number.NaN} />);
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2);
  });
});
