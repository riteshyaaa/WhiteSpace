
import ROOMCanvas from "@/components/RoomCanvas"

export default  async function CanvasRoomPage({ params }: { params: { roomId: string } }) {

  const roomId   =  (await params).roomId
  // console.log(roomId)
  return <ROOMCanvas  roomId = {roomId}></ROOMCanvas>

}
