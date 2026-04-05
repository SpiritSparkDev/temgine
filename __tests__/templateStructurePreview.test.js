const { parseTemplateStructure } = require('../components/TemplateStructurePreview');

describe('TemplateStructurePreview', () => {
  test('flat tree when no named slots — returns block[] with correct paths and children', () => {
    const nodes = parseTemplateStructure('<main>{{{blocks}}}</main>', {
      blocks: [
        {
          template: 'Hero',
          children: [{ template: 'Text' }]
        },
        { template: 'Footer' }
      ]
    });

    expect(nodes).toHaveLength(2);
    expect(nodes[0].type).toBe('block');
    expect(nodes[0].path).toBe('0');
    expect(nodes[0].label).toBe('1. Hero');
    expect(nodes[0].children).toHaveLength(1);
    expect(nodes[0].children[0].type).toBe('block');
    expect(nodes[0].children[0].path).toBe('0.0');
    expect(nodes[1].type).toBe('block');
    expect(nodes[1].path).toBe('1');
    expect(nodes[1].label).toBe('2. Footer');
  });

  test('slot grouping — named slot in template produces slot-group nodes', () => {
    const nodes = parseTemplateStructure('<main>{{{blockSlot:hero}}}</main>', {
      blocks: [
        { template: 'Hero', slot: 'hero' },
        { template: 'Teaser' }
      ]
    });

    expect(nodes.length).toBeGreaterThanOrEqual(1);
    const heroGroup = nodes.find((n) => n.type === 'slot-group' && n.slotName === 'hero');
    expect(heroGroup).toBeTruthy();
    expect(heroGroup.children).toHaveLength(1);
    expect(heroGroup.children[0].template).toBe('Hero');
  });

  test('unassigned group — block without matching slot appears in Nicht zugewiesen', () => {
    const nodes = parseTemplateStructure('<main>{{{blockSlot:hero}}}</main>', {
      blocks: [
        { template: 'Hero', slot: 'hero' },
        { template: 'Footer' }
      ]
    });

    const unassignedGroup = nodes.find((n) => n.type === 'slot-group' && n.slotName === '');
    expect(unassignedGroup).toBeTruthy();
    expect(unassignedGroup.label).toBe('Nicht zugewiesen');
    expect(unassignedGroup.children).toHaveLength(1);
    expect(unassignedGroup.children[0].template).toBe('Footer');
  });

  test('empty input — blocks:[] returns []', () => {
    const nodes = parseTemplateStructure('<main>{{{blocks}}}</main>', { blocks: [] });
    expect(nodes).toEqual([]);
  });

  test('correct dot-notation paths for nested blocks', () => {
    const nodes = parseTemplateStructure('<main>{{{blocks}}}</main>', {
      blocks: [
        {
          template: 'A',
          children: [{ template: 'A1' }]
        },
        { template: 'B' }
      ]
    });

    expect(nodes[0].path).toBe('0');
    expect(nodes[0].children[0].path).toBe('0.0');
    expect(nodes[1].path).toBe('1');
  });
});
