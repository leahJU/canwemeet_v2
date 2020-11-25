const root = document.getElementById('root');
const usernameInput = document.getElementById('username');
const roomnameInput = document.getElementById('roomname');
const button = document.getElementById('join_leave');
const container = document.getElementById('container');
const count = document.getElementById('count');
const start_meeting = document.getElementById('start_meeting');
const end_meeting = document.getElementById('end_meeting');
let connected = false;
let room;
let chat;
let conv;
let socket;

function addLocalVideo() {
    Twilio.Video.createLocalVideoTrack().then(track => {
        let video = document.getElementById('local').firstChild;
        let trackElement = track.attach();
        trackElement.addEventListener('click', () => { zoomTrack(trackElement); });
        video.appendChild(trackElement);
    });
};

function connectButtonHandler(event) {
    event.preventDefault();
    if (!connected) {
        let username = usernameInput.value;
        let roomname = roomnameInput.value;
        if (!username) {
            alert('Enter your name before connecting');
            return;
        }
        button.disabled = true;
        button.innerHTML = 'Connecting...';
        connect(username, roomname).then(() => {
            $('#roomnameInputModal').modal("hide");
            start_meeting.disabled = false;
        }).catch(() => {
            alert('Connection failed. Is the backend running?');
            button.innerHTML = 'Join call';
            button.disabled = false;
        });
    }
    else {
        disconnect();
        connected = false;
    }
};

function connect(username, roomname) {
    let promise = new Promise((resolve, reject) => {
        // get a token from the back end
        let data;
        fetch('/enter', {
            method: 'POST',
            body: JSON.stringify({'username': username,'roomname': roomname})
        }).then(res => res.json()).then(_data => {
            // join video call
            data = _data;
            return Twilio.Video.connect(data.token);
        }).then(_room => {
            room = _room;
            room.participants.forEach(participantConnected);
            room.on('participantConnected', participantConnected);
            room.on('participantDisconnected', participantDisconnected);
            connected = true;
            updateParticipantCount();
            resolve();
        }).catch(e => {
            console.log(e);
            reject();
        });
    });
    return promise;
};

function updateParticipantCount() {
    if (!connected)
        count.innerHTML = 'Disconnected.';
    else
        count.innerHTML = (room.participants.size + 1) + ' participants online.';
};

function participantConnected(participant) {
    let participantDiv = document.createElement('div');
    participantDiv.setAttribute('id', participant.sid);
    participantDiv.setAttribute('class', 'participant');

    let tracksDiv = document.createElement('div');
    participantDiv.appendChild(tracksDiv);

    let labelDiv = document.createElement('div');
    labelDiv.setAttribute('class', 'label');
    labelDiv.innerHTML = participant.identity;
    participantDiv.appendChild(labelDiv);

    container.appendChild(participantDiv);

    participant.tracks.forEach(publication => {
        if (publication.isSubscribed)
            trackSubscribed(tracksDiv, publication.track);
    });
    participant.on('trackSubscribed', track => trackSubscribed(tracksDiv, track));
    participant.on('trackUnsubscribed', trackUnsubscribed);

    updateParticipantCount();
};

function participantDisconnected(participant) {
    document.getElementById(participant.sid).remove();
    updateParticipantCount();
};

function trackSubscribed(div, track) {
    let trackElement = track.attach();
    trackElement.addEventListener('click', () => { zoomTrack(trackElement); });
    div.appendChild(trackElement);
};

function trackUnsubscribed(track) {
    track.detach().forEach(element => {
        if (element.classList.contains('participantZoomed')) {
            zoomTrack(element);
        }
        element.remove()
    });
};

function disconnect() {
    room.disconnect();
    if (chat) {
        chat.shutdown().then(() => {
            conv = null;
            chat = null;
        });
    }
    while (container.lastChild.id != 'local')
        container.removeChild(container.lastChild);
    button.innerHTML = 'Join call';
    if (root.classList.contains('withChat')) {
        root.classList.remove('withChat');
    }
    connected = false;
    updateParticipantCount();
};
function zoomTrack(trackElement) {
    if (!trackElement.classList.contains('trackZoomed')) {
        // zoom in
        container.childNodes.forEach(participant => {
            if (participant.classList && participant.classList.contains('participant')) {
                let zoomed = false;
                participant.childNodes[0].childNodes.forEach(track => {
                    if (track === trackElement) {
                        track.classList.add('trackZoomed')
                        zoomed = true;
                    }
                });
                if (zoomed) {
                    participant.classList.add('participantZoomed');
                }
                else {
                    participant.classList.add('participantHidden');
                }
            }
        });
    }
    else {
        // zoom out
        container.childNodes.forEach(participant => {
            if (participant.classList && participant.classList.contains('participant')) {
                participant.childNodes[0].childNodes.forEach(track => {
                    if (track === trackElement) {
                        track.classList.remove('trackZoomed');
                    }
                });
                participant.classList.remove('participantZoomed')
                participant.classList.remove('participantHidden')
            }
        });
    }
};

// real-time stt

socket = io.connect('http://' + document.domain + ':' + location.port + '/meetingroom');
socket.on('ready', function(){
    SpeechtoText()
});
socket.on('end',function(){
    socket.disconnect()
    location.href='/minute';
});

socket.on('receive_message',function(msg){
    $('#test').append( '<div><b style="color: #000">'+
    decodeURIComponent(msg.date) + ' ' +decodeURIComponent(msg.data) +'</b> ');
})

function startMeeting(event) {
    start_meeting.disabled = true
    end_meeting.disabled = false
    socket.emit('before_meeting')
};

function endMeeting(event) {
    end_meeting.disabled = true
    socket.emit('after_meeting')    
};

function SpeechtoText() {
    if (window.hasOwnProperty('webkitSpeechRecognition')) {
        let today = new Date(); 
        const recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.lang = "ko-KR";
        recognition.start();
        recognition.onresult = function(e) {
            for(let i = e.resultIndex, len = e.results.length; i < len; i++)
                if(e.results[i].isFinal)
                    transcript = e.results[i][0].transcript;
                    socket.emit('send_message', {
                        date:encodeURIComponent(today.toUTCString()),
                        data:encodeURIComponent(transcript)
                    })
        };
        recognition.onerror = function(e) {
            recognition.stop();
        }
    }
  }

addLocalVideo();
button.addEventListener('click', connectButtonHandler);
start_meeting.addEventListener('click', startMeeting);
end_meeting.addEventListener('click', endMeeting);
