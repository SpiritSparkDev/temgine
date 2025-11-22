export default function GalleryBlock({ images }) {
  return <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    {images.map((src,i)=>(<img key={i} src={src} style={{maxWidth:200,border:'1px solid #ccc',borderRadius:4}}/>))}
  </div>
}
