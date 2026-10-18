import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Alert,
  Avatar,
  Badge,
  BarChart,
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  LoadingBlock,
  Modal,
  ProgressBar,
  Stat,
  StatusPill,
  Table,
  Tabs,
  Td,
} from '../src/components/ui';

/*
 * Smoke tests for the design system. These components render on every screen,
 * so a runtime crash here would take the whole app down. Each test asserts the
 * user-visible contract, not internal markup.
 */

describe('Button', () => {
  it('renders its label and fires onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Book now</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Book now' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled while loading', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('respects the disabled prop', () => {
    render(<Button disabled>Nope</Button>);
    expect(screen.getByRole('button', { name: 'Nope' })).toBeDisabled();
  });
});

describe('Card + header', () => {
  it('renders a title, subtitle and children', () => {
    render(
      <Card>
        <CardHeader title="Today" subtitle="Live salon activity" />
        <p>body content</p>
      </Card>,
    );
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Live salon activity')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });
});

describe('Stat', () => {
  it('renders label, value and sub-copy', () => {
    render(<Stat label="Net collected" value="₹1,234" sub="12 visits" />);
    expect(screen.getByText('Net collected')).toBeInTheDocument();
    expect(screen.getByText('₹1,234')).toBeInTheDocument();
    expect(screen.getByText('12 visits')).toBeInTheDocument();
  });
});

describe('StatusPill', () => {
  it('maps a raw status to readable copy', () => {
    render(<StatusPill status="in_progress" />);
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('accepts an explicit label override', () => {
    render(<StatusPill status="completed" label="Done & dusted" />);
    expect(screen.getByText('Done & dusted')).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('renders the title, description and action', () => {
    render(
      <EmptyState
        title="No bookings yet"
        description="Your visits will appear here."
        action={<Button>Book now</Button>}
      />,
    );
    expect(screen.getByText('No bookings yet')).toBeInTheDocument();
    expect(screen.getByText('Your visits will appear here.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Book now' })).toBeInTheDocument();
  });
});

describe('Badge + Avatar', () => {
  it('renders a badge label', () => {
    render(<Badge tone="brand">New</Badge>);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('derives at most two initials', () => {
    render(<Avatar name="Aarav Mehta" />);
    expect(screen.getByText('AM')).toBeInTheDocument();
  });

  it('falls back to a placeholder for a blank name', () => {
    render(<Avatar name="   " />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});

describe('Tabs', () => {
  it('marks the active tab and reports changes', () => {
    const onChange = vi.fn();
    render(
      <Tabs
        value="today"
        onChange={onChange}
        tabs={[
          { id: 'today', label: 'Today' },
          { id: 'week', label: 'This week', count: 7 },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /this week/i }));
    expect(onChange).toHaveBeenCalledWith('week');
  });
});

describe('ProgressBar', () => {
  it('caps the width at 100%', () => {
    const { container } = render(<ProgressBar value={250} max={100} />);
    const fill = container.firstElementChild!.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('handles a zero max without dividing by zero', () => {
    const { container } = render(<ProgressBar value={10} max={0} />);
    const fill = container.firstElementChild!.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });
});

describe('Alert', () => {
  it('renders a title and body', () => {
    render(
      <Alert tone="warn" title="Heads up">
        Bonus expires in 7 days.
      </Alert>,
    );
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('Bonus expires in 7 days.')).toBeInTheDocument();
  });
});

describe('Modal + Drawer', () => {
  it('renders nothing when closed', () => {
    const { container: modal } = render(
      <Modal open={false} onClose={() => {}} title="Closed">
        hidden
      </Modal>,
    );
    expect(modal).toBeEmptyDOMElement();

    const { container: drawer } = render(
      <Drawer open={false} onClose={() => {}} title="Closed">
        hidden
      </Drawer>,
    );
    expect(drawer).toBeEmptyDOMElement();
  });

  it('renders content and closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Add money">
        <p>Pay ₹1,000, get ₹1,150</p>
      </Modal>,
    );
    expect(screen.getByText('Add money')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes the drawer via its close button', () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Customer detail">
        <p>profile</p>
      </Drawer>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Table', () => {
  it('renders the head and rows', () => {
    render(
      <Table head={['Name', 'Spend']}>
        <tr>
          <Td>Aarav Mehta</Td>
          <Td>₹1,200</Td>
        </tr>
      </Table>,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Aarav Mehta')).toBeInTheDocument();
    expect(screen.getByText('₹1,200')).toBeInTheDocument();
  });
});

describe('Charts and skeletons', () => {
  it('renders a bar per data point', () => {
    const { container } = render(
      <BarChart data={[{ label: 'Mon', value: 10 }, { label: 'Tue', value: 20 }]} />,
    );
    expect(container.querySelectorAll('.group').length).toBe(2);
  });

  it('shows an empty state with no data', () => {
    render(<BarChart data={[]} />);
    expect(screen.getByText('No data for this range')).toBeInTheDocument();
  });

  it('renders the requested number of skeleton rows', () => {
    const { container } = render(<LoadingBlock rows={4} />);
    expect(container.querySelectorAll('.skeleton').length).toBe(4);
  });
});
