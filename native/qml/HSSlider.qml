import QtQuick
import QtQuick.Controls
Slider {
    id: slider
    implicitHeight: 24
    background: Rectangle {
        x: slider.leftPadding; y: slider.topPadding + slider.availableHeight / 2 - height / 2
        implicitWidth: 120; implicitHeight: 3
        width: slider.availableWidth; height: 3; radius: 2; color: Backend.colors.line
        Rectangle { width: slider.visualPosition * parent.width; height: parent.height; radius: 2; color: Backend.colors.accent }
    }
    handle: Rectangle {
        x: slider.leftPadding + slider.visualPosition * (slider.availableWidth - width)
        y: slider.topPadding + slider.availableHeight / 2 - height / 2
        width: slider.pressed ? 12 : 9; height: width; radius: width / 2; color: Backend.colors.ink
        opacity: slider.enabled ? 1 : 0.3
        Behavior on width { NumberAnimation { duration: 100 } }
    }
}
