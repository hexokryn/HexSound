import QtQuick
Canvas {
    id: scene
    property string kind: "field"
    property real cursorX: width/2
    property real cursorY: height/2
    property bool motion: true
    property real followX: cursorX
    property real followY: cursorY
    property real phase: 0
    property real pulse: 0
    Behavior on followX { enabled: scene.motion; SmoothedAnimation { velocity: 700 } }
    Behavior on followY { enabled: scene.motion; SmoothedAnimation { velocity: 700 } }
    onPaint: {
        var ctx=getContext("2d");ctx.clearRect(0,0,width,height)
        if(kind==="field") {
            var light=ctx.createRadialGradient(followX,followY,0,followX,followY,width*.7)
            light.addColorStop(0,Qt.alpha(Backend.colors.accent,.17));light.addColorStop(1,"transparent")
            ctx.fillStyle=light;ctx.fillRect(0,0,width,height)
        }
        var step=kind==="field"?32:28
        ctx.lineWidth=1
        for(var y=24;y<height;y+=step){
            ctx.beginPath()
            for(var x=0;x<=width;x+=12){
                var dx=x-followX,dy=y-followY,d=Math.sqrt(dx*dx+dy*dy)
                var influence=Math.exp(-d*d/100000)
                var z=kind==="field"?Math.sin(x/240+phase+y/450)*12+dy*influence*.2:Math.sin(d/32-phase*2)*influence*(10+pulse*15)
                if(x===0)ctx.moveTo(x,y+z);else ctx.lineTo(x,y+z)
            }
            ctx.strokeStyle=Qt.alpha(Backend.colors.accent,kind==="field"?.065:.12);ctx.stroke()
        }
    }
    Timer { interval: 33; running: scene.visible && scene.motion; repeat: true; onTriggered: {scene.phase+=.012;scene.pulse*=.95;scene.requestPaint()} }
    onCursorXChanged: if(!motion)requestPaint()
    onCursorYChanged: if(!motion)requestPaint()
    onKindChanged: requestPaint()
    Component.onCompleted: requestPaint()
}
