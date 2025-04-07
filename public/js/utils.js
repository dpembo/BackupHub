function deleteEveryNotification() {
    deleteNotificationAPI();
    updatePreCount(false);
}

function deleteNotification(index) {
    deleteNotificationAPI(index);
    var preCount = updateNotificationCount();
    const itemToHide = document.getElementById("notification_" + index);
    const container = document.querySelector('.container');
    const itemToHideHeight = itemToHide.offsetHeight;

    itemToHide.style.transition = 'height 0.3s ease, opacity 0.3s ease';
    itemToHide.style.height = '0';
    itemToHide.style.opacity = '0';

    itemToHide.addEventListener('transitionend', function() {
        itemToHide.style.display = 'none';
        itemToHide.style.height = '';
    });

    const items = document.querySelectorAll('.item:not(#' + "notification_" + index + ')');
    items.forEach(item => {
        item.style.transform = `translateY(-${itemToHideHeight}px)`;
    });

    void container.offsetHeight;
    items.forEach(item => {
        item.style.transform = '';
    });
    //updatePreCount(true);
    if(preCount==0){
        const panelWrapper = document.querySelector('.panel-wrapper');
        panelWrapper.classList.remove('panel-open');
        const deleteAllButton = document.getElementById('deleteAllNotifications');
        if (deleteAllButton) {
            deleteAllButton.classList.remove('visible');
        }
    }

}

function displaySecsFromDate(inDateStr) {
    const inDate = new Date(inDateStr);
    const now = new Date().getTime();
    const historicalDateTime = inDate.getTime();
    const differenceInMillis = now - historicalDateTime;
    const differenceInSeconds = Math.floor(differenceInMillis / 1000);

    return displaySecs(differenceInSeconds);
}

function roundToDecimalPlaces(number, decimalPlaces) {
    const factor = Math.pow(10, decimalPlaces);
    return Math.round(number * factor) / factor;
}

function displaySecs(secs) {
    secs = roundToDecimalPlaces(secs, 2);
    var ret;

    if (secs < 300) ret = secs + " secs ";
    if (secs >= 300 && secs < 7200) {
        var mins = Math.floor(secs / 60);
        secs = secs % 60;
        ret = mins + " mins ";
    }
    if (secs >= 7200 && secs < 86400) {
        var mins = Math.floor(secs / 60);
        var secs = secs % 60;
        var hours = Math.floor(mins / 60);
        mins = mins % 60;
        ret = hours + " hours ";
    }
    if (secs >= 86400) {
        var mins = Math.floor(secs / 60);
        var secs = secs % 60;
        var hours = Math.floor(mins / 60);
        var days = Math.floor(hours / 24);
        hours = hours - (days * 24);
        mins = mins % 60;
        var daysStr = " days ";
        if (days == 1) daysStr = " day ";
        ret = days + daysStr;
    }

    return ret;
}


function updatePreCount(single){
    var preCount = parseInt(document.getElementById("notificationBadge").innerText)
    if(single)preCount--;
    else preCount=0;
    document.getElementById("notificationBadge").innerText = preCount;
}

function updateNotificationCount() {
    var preCount = parseInt(document.getElementById("notificationBadge").innerText) || 0;
    preCount--;
    document.getElementById("notificationBadge").innerText = preCount;
    if (preCount <= 0) {
        document.getElementById("notificationBadge").className = "notification-badge-hidden";
        document.querySelector('.panel-wrapper').classList.remove('panel-open');
    }
    return preCount;
}

var deleteNotificationAPI = async (index) => {
    try {
        const apiUrl = index !== undefined ? `/rest/notifications/${index}` : '/rest/notifications';
        const response = await fetch(apiUrl, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            console.log("Network response failed -" + response.status + " - " + response.statusText);
            throw new Error('Network response was not ok.');
        }

        const data = await response.json();
    } catch (error) {
        console.log('Error Deleting Notification:', error.message);
    }
};

let hasFetchedData = false;

function fetchDataFromAPI(reset) {
    if(reset)hasFetchedData=false;
    if (hasFetchedData) return;
    hasFetchedData = true;

    const apiUrl = '/rest/notifications';
    console.log("Fetching data from API...");
    fetch(apiUrl)
        .then(response => {
            if (!response.ok) throw new Error(`Network response was not ok: ${response.status}`);
            return response.json();
        })
        .then(data => {
            console.log('Received data:', data);     
            setNotificationData(data); 
        })
        .catch(error => {
            console.error('Error fetching data:', error);
        });
}

function setNotificationData(data) {
    if(data != null && data.length > 0) {
        document.getElementById("notificationBadge").innerText = data.length;
        document.getElementById("notificationBadge").className = "notification-badge";
    } else {
        document.getElementById("notificationBadge").className = "notification-badge-hidden";
        document.getElementById("notificationsList").innerHTML = '';
        return;
    }

    var count = data.length - 1;
    var html = '';

    data.reverse().forEach(notification => {
        if(notification.type == "ERROR") { icon = "error" }
        else if(notification.type == "WARNING") { icon = "warning" }
        else if(notification.type == "INFORMATION") { icon = "info" }
        else icon = "error";

        html += '<div class="notify-animate notification notification-' + icon +'" id="notification_' + count + '">';
        html += '<div class="notify-header">';
        html += '<span title="Notification" class="notify-icon material-icons vertMid notify-status-icon notify-status-icon-' + icon + '">' + icon + '</span>';
        html += '<span class="notify-title notify-title-' + icon + '">' + notification.title + '</span><span class="circle"></span>';
        html += '<span class="notify-time" title="' + notification.runDate + '">' + displaySecsFromDate(notification.runDate) + '</span>';
        html += '</div>';       
        html += '<div class="notify-text">' + notification.description + '</div>';
        html += '<div class="notify-actions">';
        html += `<span class="notify-link" onclick="document.location.href='${notification.url}'"><span title="Goto Detail" class="material-icons vertMid">remove_red_eye</span></span>`;
        html += '<span class="notify-delete" onclick="deleteNotification('+count+')"><span title="Delete Notification" class="material-icons vertMid">delete</span></span>';
        html += '</div>';
        html += '</div>';

        count--;
    });

    document.getElementById("notificationsList").innerHTML = html;

    let deleteAllButton = document.getElementById('deleteAllNotifications');
    if (!deleteAllButton) {
        deleteAllButton = document.createElement('div');
        deleteAllButton.id = 'deleteAllNotifications';
        deleteAllButton.className = 'notify-delete-all-circle';
        deleteAllButton.innerText = 'X';
        deleteAllButton.addEventListener('click', deleteAllNotifications);
        document.querySelector('.panel-wrapper').appendChild(deleteAllButton);
    }
}

function deleteAllNotifications() {
    deleteEveryNotification();
    document.getElementById("notificationsList").innerHTML = '';
    document.getElementById("notificationBadge").className = "notification-badge-hidden";
    setNotificationData([]);

    const panelWrapper = document.querySelector('.panel-wrapper');
    panelWrapper.classList.remove('panel-open');
    const deleteAllButton = document.getElementById('deleteAllNotifications');
    if (deleteAllButton) {
        deleteAllButton.classList.remove('visible');
    }
}



document.addEventListener('DOMContentLoaded', function() {
    console.log("Materialize AutoInit disabled to prevent interference");

    fetchDataFromAPI();

    const btnOpenPanel = document.querySelector('.btn-open-panel');
    const panelWrapper = document.querySelector('.panel-wrapper');
    

    // Toggle panel on btnOpenPanel click
    btnOpenPanel.addEventListener('click', function(event) {
        event.stopPropagation();
        event.preventDefault();

        var preCount = parseInt(document.getElementById("notificationBadge").innerText) || 0;
        if (preCount <= 0) {
            console.log(`No notifications to display`);
            M.toast({html: "No Notifications to display!", displayLength: 2000});
            return; // Exit if no notifications
        }
        
        // Toggle the panel-open class
        panelWrapper.classList.toggle('panel-open');
        
        const deleteAllButton = document.getElementById('deleteAllNotifications');
        if (panelWrapper.classList.contains('panel-open')) {
            if (deleteAllButton) {
                deleteAllButton.classList.add('visible');
            }
        } else {
            if (deleteAllButton) {
                deleteAllButton.classList.remove('visible');
            }
        }
    });

    const btnClosePanel = document.querySelector('.btn-close-panel');
    btnClosePanel.addEventListener('click', function() {
        document.querySelector('.panel-wrapper').classList.remove('panel-open');
        const deleteAllButton = document.getElementById('deleteAllNotifications');
        if (deleteAllButton) {
            deleteAllButton.classList.remove('visible');
        }
    });

    document.addEventListener('click', function(event) {
        const panelWrapper = document.querySelector('.panel-wrapper');
        const btnOpenPanel = document.querySelector('.btn-open-panel');
        if (!panelWrapper.contains(event.target) && event.target !== btnOpenPanel) {
            panelWrapper.classList.remove('panel-open');
            const deleteAllButton = document.getElementById('deleteAllNotifications');
            if (deleteAllButton) {
                deleteAllButton.classList.remove('visible');
            }
        }
    });

    const deleteAllButton = document.getElementById('deleteAllNotifications');
    if (deleteAllButton) {
        deleteAllButton.addEventListener('click', deleteAllNotifications);
    }
});