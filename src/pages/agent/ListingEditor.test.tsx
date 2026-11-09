import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { authValue } from '../../test/mocks';
import { currentUrl, makeListing, renderAt } from '../../test/utils';
import { ListingEditor } from './ListingEditor';

const h = vi.hoisted(() => ({
  auth: {} as ReturnType<typeof import('../../test/mocks').authValue>,
  agent: { apiCreateListing: vi.fn(), apiUpdateListing: vi.fn(), apiGeocode: vi.fn() },
  apiGetListing: vi.fn(),
  uploadImage: vi.fn(),
}));
vi.mock('../../api/agent', () => h.agent);
vi.mock('../../api/listings', () => ({ apiGetListing: h.apiGetListing }));
// Keep the real file checks, fake only the network upload.
vi.mock('../../api/upload', async (orig) => ({ ...(await orig<typeof import('../../api/upload')>()), uploadImage: h.uploadImage }));
vi.mock('../../state/AuthContext', () => ({ useAuth: () => h.auth }));
// The map picker has its own tests. This stub shows the pin and lets a test "click the map".
vi.mock('../../components/MapPicker', () => ({
  default: ({ lat, lng, onChange }: { lat: number | null; lng: number | null; onChange: (a: number, b: number) => void }) => (
    <button type="button" onClick={() => onChange(5.85, -55.2)}>map pin {lat ?? '-'},{lng ?? '-'}</button>
  ),
}));

let n = 0;
beforeEach(() => {
  n = 0;
  h.auth = authValue();
  h.agent.apiCreateListing.mockResolvedValue('new-id');
  h.agent.apiUpdateListing.mockResolvedValue(undefined);
  h.agent.apiGeocode.mockResolvedValue([]);
  h.uploadImage.mockImplementation(async () => `img-${++n}`);
});

const field = (name: string) => screen.getByLabelText(new RegExp(`^${name}`));
const openNew = () => renderAt(<ListingEditor />, { route: '/agent/new', path: '/agent/new' });
const openEdit = () => renderAt(<ListingEditor />, { route: '/agent/x1/edit', path: '/agent/:id/edit' });
const jpg = (name = 'a.jpg', size = 1000) => new File([new Uint8Array(size)], name, { type: 'image/jpeg' });

/** Fill every required field with valid values. */
async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(field('Headline'), 'Bright family home');
  await user.type(field('Description'), 'Three bedrooms and a big garden.');
  await user.type(field('Address'), 'Kerkplein 1');
  await user.type(field('City'), 'Paramaribo');
  await user.type(field('Country'), 'Suriname');
  await user.type(field('Price'), '250000');
  await user.type(field('Agency'), 'Sun Realty');
  await user.type(field('Phone'), '+597 555 0100');
}

describe('ListingEditor: new listing', () => {
  test('agency and phone come from the last saved listing', async () => {
    localStorage.setItem('rofo.agent.profile', JSON.stringify({ agency: 'Sun Realty', phone: '+597 1234' }));
    openNew();
    expect(screen.getByRole('heading', { name: 'New listing' })).toBeInTheDocument();
    expect(field('Agency')).toHaveValue('Sun Realty');
    expect(field('Phone')).toHaveValue('+597 1234');
  });

  test('missing fields are flagged and nothing is sent', async () => {
    openNew();
    await userEvent.click(screen.getByRole('button', { name: 'Publish listing' }));
    expect(screen.getByText('Fix the highlighted fields.')).toBeInTheDocument();
    expect(screen.getByText('Title needs at least 3 characters')).toBeInTheDocument();
    expect(screen.getByText('Enter a price above 0')).toBeInTheDocument();
    expect(h.agent.apiCreateListing).not.toHaveBeenCalled();
  });

  test('a valid form is published, the profile remembered, and the agent sent back', async () => {
    const user = userEvent.setup();
    openNew();
    await fillValid(user);
    await user.type(field('Features'), 'Pool, Garage , ');
    await user.click(screen.getByRole('button', { name: 'Publish listing' }));
    expect(h.agent.apiCreateListing).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Bright family home', price: 250000, features: ['Pool', 'Garage'], lat: null, lng: null, agency: 'Sun Realty',
    }));
    await waitFor(() => expect(currentUrl()).toBe('/agent'));
    expect(JSON.parse(localStorage.getItem('rofo.agent.profile')!)).toEqual({ agency: 'Sun Realty', phone: '+597 555 0100' });
  });

  test('rent changes the price label; Land hides rooms and living area', async () => {
    const user = userEvent.setup();
    openNew();
    await user.selectOptions(field('Listing type'), 'rent');
    expect(field('Rent per month')).toBeInTheDocument();
    await user.selectOptions(field('Property type'), 'Land');
    expect(screen.queryByLabelText(/^Bedrooms/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Living area/)).not.toBeInTheDocument();
    expect(field('Plot size')).toBeInTheDocument();
  });

  test('a save error is shown; revoked access refreshes the session', async () => {
    const user = userEvent.setup();
    h.agent.apiCreateListing.mockRejectedValue(new Error('Your agent access was revoked'));
    openNew();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Publish listing' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your agent access was removed.');
    expect(h.auth.refresh).toHaveBeenCalledOnce();
    expect(currentUrl()).toBe('/agent/new');
  });
});

describe('ListingEditor: map and address search', () => {
  test('clicking the map fills latitude and longitude', async () => {
    openNew();
    await userEvent.click(await screen.findByRole('button', { name: /map pin/ }));
    expect(field('Latitude')).toHaveValue('5.85');
    expect(field('Longitude')).toHaveValue('-55.2');
    expect(screen.getByRole('button', { name: 'map pin 5.85,-55.2' })).toBeInTheDocument();
  });

  test('typed coordinates move the pin', async () => {
    openNew();
    fireEvent.change(field('Latitude'), { target: { value: '12.1' } });
    fireEvent.change(field('Longitude'), { target: { value: '-68.9' } });
    expect(await screen.findByRole('button', { name: 'map pin 12.1,-68.9' })).toBeInTheDocument();
  });

  test('Find on map needs an address first', async () => {
    openNew();
    await userEvent.click(screen.getByRole('button', { name: 'Find on map' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a street address first.');
    expect(h.agent.apiGeocode).not.toHaveBeenCalled();
  });

  test('choosing a match sets the pin and fills a blank city, keeps a typed country', async () => {
    const user = userEvent.setup();
    h.agent.apiGeocode.mockResolvedValue([{ label: 'Kerkplein 1, Paramaribo', lat: 5.826789, lng: -55.16, city: 'Paramaribo', country: 'Suriname' }]);
    openNew();
    await user.type(field('Address'), 'Kerkplein 1');
    await user.type(field('Country'), 'SR');
    await user.click(screen.getByRole('button', { name: 'Find on map' }));
    expect(h.agent.apiGeocode).toHaveBeenCalledWith('Kerkplein 1, SR');
    const list = await screen.findByRole('list', { name: 'Address matches' });
    await user.click(within(list).getByRole('button'));
    expect(field('Latitude')).toHaveValue('5.82679');
    expect(field('City')).toHaveValue('Paramaribo');
    expect(field('Country')).toHaveValue('SR');
    expect(screen.queryByRole('list', { name: 'Address matches' })).not.toBeInTheDocument();
  });

  test('no match: a hint to place the pin by hand', async () => {
    const user = userEvent.setup();
    openNew();
    await user.type(field('Address'), 'Nowhere 99');
    await user.click(screen.getByRole('button', { name: 'Find on map' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No match.');
  });
});

describe('ListingEditor: photos', () => {
  test('uploads each photo, the first becomes the cover, and photos can be reordered and removed', async () => {
    const user = userEvent.setup();
    openNew();
    await user.upload(screen.getByTestId('photo-input'), [jpg('a.jpg'), jpg('b.jpg')]);
    await waitFor(() => expect(screen.getAllByRole('figure')).toHaveLength(2));
    expect(within(screen.getAllByRole('figure')[0]).getByText('Cover')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Make cover' }));
    // img-2 is now first, so saving sends it first.
    await user.click(screen.getByRole('button', { name: 'Remove photo 2' }));
    expect(screen.getAllByRole('figure')).toHaveLength(1);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Publish listing' }));
    expect(h.agent.apiCreateListing).toHaveBeenCalledWith(expect.objectContaining({ images: ['img-2'] }));
  });

  test('a wrong file type is refused with its name, others still upload', async () => {
    const user = userEvent.setup({ applyAccept: false });
    openNew();
    await user.upload(screen.getByTestId('photo-input'), [new File(['x'], 'plan.pdf', { type: 'application/pdf' }), jpg()]);
    expect(await screen.findByRole('alert')).toHaveTextContent('plan.pdf: use JPEG, PNG or WebP');
    await waitFor(() => expect(screen.getAllByRole('figure')).toHaveLength(1));
    expect(h.uploadImage).toHaveBeenCalledOnce();
  });

  test('saving is blocked while photos upload', async () => {
    const user = userEvent.setup();
    h.uploadImage.mockImplementation(() => new Promise(() => {})); // never finishes
    openNew();
    await user.upload(screen.getByTestId('photo-input'), jpg());
    expect(await screen.findByText('Uploading 1...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish listing' })).toBeDisabled();
  });

  test('pressing Enter mid upload does not save either', async () => {
    const user = userEvent.setup();
    h.uploadImage.mockImplementation(() => new Promise(() => {}));
    openNew();
    await fillValid(user);
    await user.upload(screen.getByTestId('photo-input'), jpg());
    await screen.findByText('Uploading 1...');
    fireEvent.submit(field('Headline').closest('form')!); // Enter in a field submits even with the button disabled
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait for the photos to finish uploading.');
    expect(h.agent.apiCreateListing).not.toHaveBeenCalled();
  });
});

describe('ListingEditor: editing', () => {
  test('loads the listing into the form and saves changes to the same id', async () => {
    const user = userEvent.setup();
    h.apiGetListing.mockResolvedValue(makeListing({ id: 'x1', title: 'Old title', imageKeys: ['k1'], images: ['https://cdn/k1.jpg'], agent: { name: 'A', agency: 'Sun Realty', phone: '+597 555 0100' } }));
    openEdit();
    expect(screen.getByText('Loading listing...')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Edit listing' })).toBeInTheDocument();
    expect(field('Headline')).toHaveValue('Old title');
    expect(screen.getAllByRole('figure')).toHaveLength(1);
    await user.clear(field('Headline'));
    await user.type(field('Headline'), 'New title');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(h.agent.apiUpdateListing).toHaveBeenCalledWith('x1', expect.objectContaining({ title: 'New title', images: ['k1'] }));
    expect(h.agent.apiCreateListing).not.toHaveBeenCalled();
  });

  test('an unknown id says so', async () => {
    h.apiGetListing.mockResolvedValue(undefined);
    openEdit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Listing not found');
  });
});
