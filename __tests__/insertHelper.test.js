const insertHelper = require('../lib/insertHelper')

describe('insertHelper', () => {
  beforeEach(() => {
    // clear any registered editor API
    try { insertHelper.registerEditorApi(null) } catch (e) {}
  })

  test('registerEditorApi and getEditorApi', () => {
    const api = { insert: () => true }
    insertHelper.registerEditorApi(api)
    expect(insertHelper.getEditorApi()).toBe(api)
  })

  test('insertText uses sync insert when available', async () => {
    const buffer = []
    const api = {
      insert(text) {
        buffer.push(text)
        return true
      },
      insertAsync: async (text) => { buffer.push(text); return true },
      focus() {}
    }
    insertHelper.registerEditorApi(api)
    const ok = await insertHelper.insertText('hello', () => {})
    expect(ok).toBe(true)
    expect(buffer).toEqual(['hello'])
  })

  test('insertText falls back to provided fallback when no editor', async () => {
    insertHelper.registerEditorApi(null)
    const fb = jest.fn()
    const ok = await insertHelper.insertText('x', fb)
    expect(ok).toBe(false)
    expect(fb).toHaveBeenCalled()
  })

  test('createButtonHandlers triggers insertText on keydown and mousedown', async () => {
    const spy = jest.spyOn(insertHelper, 'insertText').mockImplementation(() => Promise.resolve(true))
    const fallback = jest.fn()
    const handlers = insertHelper.createButtonHandlers('abc', fallback)

    const mdEvent = { preventDefault: jest.fn() }
    handlers.onMouseDown(mdEvent)
    expect(mdEvent.preventDefault).toHaveBeenCalled()
    expect(spy).toHaveBeenCalledWith('abc', fallback)

    const kdEvent = { preventDefault: jest.fn(), key: 'Enter' }
    handlers.onKeyDown(kdEvent)
    expect(kdEvent.preventDefault).toHaveBeenCalled()
    spy.mockRestore()
  })
})
