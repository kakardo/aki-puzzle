import { useState } from 'react'
import PuzzleBoard from './PuzzleBoard'
import './App.css'

function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageSrc(reader.result as string)
    reader.readAsDataURL(file)
  }

  if (imageSrc) {
    return <PuzzleBoard imageSrc={imageSrc} onReset={() => setImageSrc(null)} />
  }

  return (
    <div className="upload-screen">
      <h1>ZenPiece</h1>
      <p>Upload an image to start your puzzle</p>
      <label className="upload-btn">
        Choose image
        <input type="file" accept="image/*" onChange={handleFile} hidden />
      </label>
    </div>
  )
}

export default App
