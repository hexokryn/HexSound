import QtQuick
import QtQuick.Controls
ComboBox {
    id: control
    implicitHeight: 40
    implicitWidth: 160
    font.pixelSize: 14
    leftPadding: 12; rightPadding: 32
    contentItem: Text { text: control.displayText; font: control.font; color: Backend.colors.ink; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
    background: Rectangle { radius: 9; color: Backend.colors.raised; border.color: control.activeFocus ? Backend.colors.accent : Backend.colors.line }
    indicator: HSIcon { name: "back"; rotation: -90; width: 16; height: 16; x: control.width-26; y: (control.height-height)/2; ink: Backend.colors.muted }
    delegate: ItemDelegate {
        width: control.width-12; implicitHeight: 38
        contentItem: Text { text: control.textAt(index); color: Backend.colors.ink; font: control.font; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
        background: Rectangle { radius: 7; color: control.highlightedIndex===index ? Backend.colors.raised : "transparent" }
        highlighted: control.highlightedIndex===index
    }
    popup: Popup {
        y: control.height+6; width: control.width; padding: 6
        implicitHeight: Math.min(list.contentHeight+12,272)
        background: Rectangle { radius: 12; color: Backend.colors.surface; border.color: Backend.colors.line }
        contentItem: ListView { id: list; clip: true; model: control.popup.visible ? control.delegateModel : null; currentIndex: control.highlightedIndex; ScrollIndicator.vertical: ScrollIndicator {} }
    }
}
