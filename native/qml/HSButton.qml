import QtQuick
import QtQuick.Controls

Button {
    id: control
    property bool primary: false
    property bool selected: false
    property bool quiet: false
    property string iconName: ""
    property bool alignLeft: false
    property color ink: Backend.colors.ink
    property color accent: Backend.colors.accent
    implicitHeight: 40
    implicitWidth: Math.max(40, label.implicitWidth + (iconName ? 28 : 0) + 30)
    hoverEnabled: true
    font.pixelSize: 14
    padding: 12
    contentItem: Item {
        HSIcon { id: glyph; name: control.iconName; visible: !!name; ink: control.primary ? Backend.colors.bg : control.ink; anchors.verticalCenter: parent.verticalCenter; x: control.alignLeft ? 0 : (parent.width - (label.text ? Math.min(label.implicitWidth,parent.width-28) + 28 : width))/2 }
        Text {
            id: label
            text: control.text; font: control.font
            color: control.primary ? Backend.colors.bg : control.enabled ? control.ink : Backend.colors.muted
            anchors.verticalCenter: parent.verticalCenter
            x: control.iconName ? glyph.x + 28 : control.alignLeft ? 0 : Math.max(0,(parent.width-label.implicitWidth)/2)
            width: Math.max(0,parent.width - x)
            elide: Text.ElideRight
        }
    }
    background: Rectangle {
        radius: 9
        color: control.primary ? control.accent : control.selected || control.down ? Backend.colors.raised : control.hovered ? Backend.colors.surface : "transparent"
        border.color: control.activeFocus ? control.accent : control.quiet || control.primary ? "transparent" : Backend.colors.line
        opacity: control.enabled ? 1 : 0.45
        Behavior on color { ColorAnimation { duration: Backend.settings.motion ? 140 : 0 } }
    }
    ToolTip.visible: hovered && ToolTip.text.length > 0
    ToolTip.delay: 650
}
