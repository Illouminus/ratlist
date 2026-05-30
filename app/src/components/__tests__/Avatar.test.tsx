import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Avatar } from '../Avatar';

describe('<Avatar>', () => {
  it('renders the uploaded image when avatarUrl is present', () => {
    const { container } = render(<Avatar avatarUrl="https://cdn.example/x.jpg" name="Hui" />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://cdn.example/x.jpg');
    // No initial badge alongside the image.
    expect(screen.queryByText('H')).toBeNull();
  });

  it('falls back to the uppercased first letter of name when no avatarUrl', () => {
    const { container } = render(<Avatar avatarUrl={null} name="hui" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('H')).toBeTruthy();
  });

  it('shows ? when the name is blank', () => {
    render(<Avatar avatarUrl={null} name="   " />);
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('falls back to the initial badge if the image fails to load', () => {
    const { container } = render(<Avatar avatarUrl="https://cdn.example/broken.jpg" name="Hui" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('H')).toBeTruthy();
  });
});
