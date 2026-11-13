jest.mock('../lib/prisma', () => ({ prisma: { page: { findMany: jest.fn(), update: jest.fn() }, pageRevision: { create: jest.fn() } } }));

import { prisma as mockPrisma } from '../lib/prisma';
import { propagateSharedBlocks } from '../lib/sharedBlockSync';

const ban = (title) => ({ id: 'ban', template: 'Banner', props: { title } });

test('geänderter geteilter Block landet in anderen Seiten (auch Unterseiten), die Quellseite bleibt unberührt', async () => {
  mockPrisma.page.findMany.mockResolvedValue([
    { id: 'src', title: 'Quelle', blocks: [ban('Neu')], data: {}, children: [] },
    { id: 'p2', title: 'Landing', blocks: [{ id: 'x' }, ban('Alt'), ban('Alt')], data: {}, children: [
      { id: 'p3', title: 'Unter', slug: 'u', blocks: [ban('Alt')], data: {}, children: [] },
      { id: 'p4', title: 'Ohne', slug: 'o', blocks: [{ id: 'y' }], data: {}, children: [] },
    ] },
  ]);
  mockPrisma.page.update.mockImplementation(async ({ data }) => ({ id: 'p2', title: 'Landing', slug: 'l', ...data }));
  const touched = await propagateSharedBlocks('src', new Map([['ban', ban('Neu')]]), { name: 'U' });
  expect(touched.sort()).toEqual(['Landing', 'Unter']);
  expect(mockPrisma.page.update).toHaveBeenCalledTimes(1);
  const { where, data } = mockPrisma.page.update.mock.calls[0][0];
  expect(where.id).toBe('p2');
  expect(data.blocks.map((b) => b.props && b.props.title)).toEqual([undefined, 'Neu', 'Neu']);
  expect(data.blocks).toHaveLength(3);
  expect(data.data._savedBy).toBe('U');
  expect(data.children[0].blocks[0].props.title).toBe('Neu');
  expect(data.children[0].data._savedAt).toBeTruthy();
  expect(data.children[1].data._savedAt).toBeUndefined();
  expect(mockPrisma.pageRevision.create).toHaveBeenCalledTimes(1);
});
