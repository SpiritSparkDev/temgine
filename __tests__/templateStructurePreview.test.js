const { parseTemplateStructure } = require('../components/TemplateStructurePreview');

describe('TemplateStructurePreview', () => {
  test('tracks total block count for nested page blocks', () => {
    const nodes = parseTemplateStructure('<main>{{{blocks}}}</main>', {
      blocks: [
        {
          template: 'Hero',
          children: [
            { template: 'Text' },
            {
              template: 'Gallery',
              children: [{ template: 'Image' }]
            }
          ]
        },
        { template: 'Footer' }
      ]
    });

    const mainNode = nodes.find((node) => node.label === 'main');
    expect(mainNode).toBeTruthy();

    const blocksPlaceholder = mainNode.children.find((node) => node.type === 'block-slot' && node.slotName === 'main');
    expect(blocksPlaceholder).toBeTruthy();
    expect(blocksPlaceholder.totalBlockCount).toBe(5);
    expect(blocksPlaceholder.children).toHaveLength(2);
    expect(blocksPlaceholder.children[0].children).toHaveLength(2);
    expect(blocksPlaceholder.children[0].children[1].children).toHaveLength(1);
  });

  test('renders assigned blocks as clickable children under their slots', () => {
    const nodes = parseTemplateStructure('<main><section>{{{blockSlot:hero}}}</section></main>', {
      blocks: [
        { template: 'Hero', slot: 'hero' },
        { template: 'Teaser' }
      ]
    });

    const mainNode = nodes.find((node) => node.label === 'main');
    const sectionNode = mainNode.children.find((node) => node.label === 'section');
    const slotNode = sectionNode.children.find((node) => node.type === 'block-slot');

    expect(slotNode).toBeTruthy();
    expect(slotNode.slotName).toBe('hero');
    expect(slotNode.children).toHaveLength(1);
    expect(slotNode.children[0].type).toBe('page-block');
    expect(slotNode.children[0].label).toContain('Hero');
  });

  test('adds an unassigned blocks fallback when no blocks placeholder exists', () => {
    const nodes = parseTemplateStructure('<main><section>{{{blockSlot:hero}}}</section></main>', {
      blocks: [
        { template: 'Hero', slot: 'hero' },
        { template: 'Footer' }
      ]
    });

    const mainNode = nodes.find((node) => node.label === 'main');
    const blocksPlaceholder = mainNode.children.find((node) => node.type === 'blocks-placeholder');

    expect(blocksPlaceholder).toBeTruthy();
    expect(blocksPlaceholder.totalBlockCount).toBe(2);
    expect(blocksPlaceholder.children).toHaveLength(1);
    expect(blocksPlaceholder.children[0].label).toContain('Footer');
  });

  test('treats singular block placeholder as blocks position in preview', () => {
    const nodes = parseTemplateStructure('<main><div>{{block}}</div><footer>{{{blockSlot:hero}}}</footer></main>', {
      blocks: [
        { template: 'Text' },
        { template: 'Hero', slot: 'hero' }
      ]
    });

    const mainNode = nodes.find((node) => node.label === 'main');
    const divNode = mainNode.children.find((node) => node.label === 'div');
    const blocksPlaceholder = divNode.children.find((node) => node.type === 'block-slot' && node.slotName === 'div');

    expect(blocksPlaceholder).toBeTruthy();
    expect(blocksPlaceholder.totalBlockCount).toBe(2);
    expect(blocksPlaceholder.children).toHaveLength(1);
    expect(blocksPlaceholder.children[0].label).toContain('Text');
  });
});
