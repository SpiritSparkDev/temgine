import TextBlock from './TextBlock'
import GalleryBlock from './GalleryBlock'
export default function StandardTemplate({ blocks }) {
  return <div className="standard-template">
    {blocks.map((block,i)=>{
      if(block.type==='text') return <TextBlock key={i} {...block.props} />
      if(block.type==='gallery') return <GalleryBlock key={i} {...block.props} />
      return <pre key={i}>{JSON.stringify(block)}</pre>
    })}
  </div>
}
