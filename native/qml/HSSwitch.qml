import QtQuick
import QtQuick.Controls
Switch {
    id: toggle
    implicitWidth: 40; implicitHeight: 28
    leftPadding: 0; rightPadding: 0
    indicator: Rectangle {
        x: 0; y: (toggle.height-height)/2; width: 36; height: 21; radius: 11
        color: toggle.checked ? Backend.colors.accent : Backend.colors.raised
        border.color: toggle.checked ? "transparent" : Backend.colors.line
        Rectangle { x: toggle.checked ? 17 : 3; y: 3; width: 15; height: 15; radius: 8; color: toggle.checked ? Backend.colors.bg : Backend.colors.muted
            Behavior on x { NumberAnimation { duration: Backend.settings.motion ? 160 : 0; easing.type: Easing.OutCubic } }
        }
    }
    contentItem: Item {}
}
