import type { CachedMetadata } from 'obsidian'
import { getAliasesFromMetadata, isFileOffice } from '../tools/utils'

describe('Utils', () => {
  describe('getAliasesFromMetadata', () => {
    it('should return an empty array if no metadata is provided', () => {
      // Act
      const actual = getAliasesFromMetadata(null)
      // Assert
      expect(actual).toEqual([])
    })
    it('should return an empty array if no aliases are provided', () => {
      // Act
      const actual = getAliasesFromMetadata({})
      // Assert
      expect(actual).toEqual([])
    })
    it('should return the aliases array as-is', () => {
      // Arrange
      const metadata = {
        frontmatter: { aliases: ['foo', 'bar'] },
      } as unknown as CachedMetadata
      // Act
      const actual = getAliasesFromMetadata(metadata)
      // Assert
      expect(actual).toEqual(['foo', 'bar'])
    })
    it('should convert the aliases string into an array', () => {
      // Arrange
      const metadata = {
        frontmatter: { aliases: 'foo, bar' },
      } as unknown as CachedMetadata
      // Act
      const actual = getAliasesFromMetadata(metadata)
      // Assert
      expect(actual).toEqual(['foo', 'bar'])
    })
    it('should return an empty array if the aliases field is an empty string', () => {
      // Arrange
      const metadata = {
        frontmatter: { aliases: '' },
      } as unknown as CachedMetadata
      // Act
      const actual = getAliasesFromMetadata(metadata)
      // Assert
      expect(actual).toEqual([])
    })
  })

  describe('isFileOffice', () => {
    it.each([
      'document.docx',
      'spreadsheet.xlsx',
      'presentation.pptx',
      'Presentation.PPTX',
    ])(
      'should return true for %s',
      path => {
        expect(isFileOffice(path)).toBe(true)
      }
    )

    it.each(['note.md', 'document.pdf', 'image.png'])(
      'should return false for %s',
      path => {
        expect(isFileOffice(path)).toBe(false)
      }
    )
  })
})
