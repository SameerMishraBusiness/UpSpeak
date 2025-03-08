let mediaRecorder;
let recordedChunks = [];
let videoElement = document.getElementById("video");
let startBtn = document.getElementById("startBtn");
let stopBtn = document.getElementById("stopBtn");
let restartBtn = document.getElementById("restartBtn");
let transcriptionBox = document.getElementById("transcription");
let goBackBtn = document.getElementById("goBackBtn");
let fillerFeedback = document.getElementById("filler-feedback");
let strengthsFeedback = document.getElementById("strengths-feedback");
let improvementFeedback = document.getElementById("improvement-feedback");

let stream;
let recognition;
let isRecording = false;
let finalTranscript = "";
let silenceTimeout;

// Quest progress variables (initialize from localStorage or default)
let speechesDelivered = parseInt(localStorage.getItem("speechesDelivered")) || 0;
let puzzlesCompleted = parseInt(localStorage.getItem("puzzlesCompleted")) || 0;
let speechesWatched = parseInt(localStorage.getItem("speechesWatched")) || 0;

let previousFrame = null;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

document.querySelector('.container').classList.add('speech-finished');

async function startVideoStream() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
        videoElement.srcObject = stream;
        videoElement.play();
    } catch (error) {
        console.error("Error accessing webcam:", error);
    }
}

function setupSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        alert("Your browser does not support speech recognition.");
        return;
    }

    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US'; // Set the language

    recognition.onresult = function (event) {
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;

            if (event.results[i].isFinal) {
                clearTimeout(silenceTimeout);
                finalTranscript += transcript + ". ";
            } else {
                interimTranscript += transcript;
            }
        }

        transcriptionBox.textContent = finalTranscript + interimTranscript;

        clearTimeout(silenceTimeout);
        silenceTimeout = setTimeout(() => {
            if (interimTranscript) {
                finalTranscript += interimTranscript + ". ";
                transcriptionBox.textContent = finalTranscript;
            }
        }
            , 1000);
    };

    recognition.onerror = function (event) {
        console.error("Speech Recognition Error:", event.error);
    };

    recognition.onend = function () {
        if (isRecording) {
            recognition.start();
        } else {
            evaluateSpeech();
        }
    };
}

function startRecording() {
    recordedChunks = [];
    const options = { mimeType: 'video/webm; codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.log(options.mimeType + ' is not Supported');
        options = { mimeType: 'video/webm; codecs=vp8' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.log(options.mimeType + ' is not Supported');
            options = { mimeType: 'video/webm' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                console.log(options.mimeType + ' is not Supported');
                options = { mimeType: '' };
            }
        }
    }
    try {
        mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
        console.error('Exception while creating MediaRecorder:', e);
        return;
    }

    mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: "video/webm" });
        const videoUrl = URL.createObjectURL(blob);

        videoElement.srcObject = null;
        videoElement.src = videoUrl;
        videoElement.controls = true;
        videoElement.muted = false; // Ensure the video isn't muted
        await videoElement.play();

        // Generate a unique key for this speech
        const speechKey = `speech_${Date.now()}`;

        // Save the video blob to local storage
        blobToBase64(blob, (base64Data) => {
            localStorage.setItem(`${speechKey}_video`, base64Data);
        });

        // Save the transcript to local storage
        localStorage.setItem(`${speechKey}_transcript`, finalTranscript);

        // Save the key to a list of speech keys (consider using JSON.stringify/parse for arrays)
        saveSpeechKey(speechKey);

        // Increment speechesWatched and save
        speechesWatched++;
        localStorage.setItem("speechesWatched", speechesWatched.toString());

    };

    mediaRecorder.start(10); // Start recording in 10ms intervals
    recognition.start();
    isRecording = true;

    startBtn.disabled = true;
    stopBtn.disabled = false;
    restartBtn.disabled = true;
    goBackBtn.style.display = "none";

    previousFrame = null;
    detectHandMotions();
}

function stopRecording() {
    if (isRecording) {
        mediaRecorder.stop();
        recognition.stop();
        isRecording = false;

        stopBtn.disabled = true;
        restartBtn.disabled = false;
    }
}

function restartRecording() {
    finalTranscript = "";
    transcriptionBox.textContent = "Transcription will appear here...";
    fillerFeedback.style.display = "none";
    strengthsFeedback.style.display = "none";
    improvementFeedback.style.display = "none";
    startBtn.disabled = false;
    stopBtn.disabled = true;
    restartBtn.disabled = true;
    goBackBtn.style.display = "none";

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    if (recognition && isRecording) {
        recognition.stop();
    }

    startVideoStream();
    setupSpeechRecognition();
}

function detectHandMotions() {
    if (!videoElement.videoWidth || !videoElement.videoHeight) {
        requestAnimationFrame(detectHandMotions);
        return;
    }

    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let motionCount = 0;

    if (previousFrame) {
        const width = currentFrame.width;
        const height = currentFrame.height;

        // Iterate over each pixel
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4; // RGBA values

                // Calculate the color difference for each channel (Red, Green, Blue)
                const diffRed = Math.abs(currentFrame.data[index] - previousFrame.data[index]);
                const diffGreen = Math.abs(currentFrame.data[index + 1] - previousFrame.data[index + 1]);
                const diffBlue = Math.abs(currentFrame.data[index + 2] - previousFrame.data[index + 2]);

                // If the color difference is significant, increase the motion count
                if (diffRed > 20 || diffGreen > 20 || diffBlue > 20) {
                    motionCount++;
                }
            }
        }
    }

    previousFrame = currentFrame;  // Store the current frame for the next comparison
    requestAnimationFrame(detectHandMotions);

    return motionCount;
}

async function evaluateSpeech() {
    speechesDelivered++; // Increment speech count

    // Save the updated value to localStorage
    localStorage.setItem("speechesDelivered", speechesDelivered.toString());

    const strengths = [];
    const improvement = [];

    const sentences = finalTranscript.split(/[.!?]/).filter(Boolean);
    const wordCount = finalTranscript.split(/\s+/).filter(Boolean).length;

    if (sentences.length >= 5 && wordCount > 150) {
        strengths.push("Content: Constructing thorough and detailed content helped inform the audience when delivering your speech! ");
    } else {
        improvement.push("Content: Although brevity is often powerful, expanding upon your key ideas can elevate the speech.");
    }

    const complexSentences = sentences.filter(sentence => sentence.split(' ').length > 15).length;
    if (complexSentences > 2) {
        strengths.push("Complexity: Using advanced words and sentences created a sense of professionalism in your speech!");
    } else {
        improvement.push("Complexity: Even though simplicity is often helpful, using advanced vocabulary can create a sense of professionalism in your speech.");
    }

    if (finalTranscript.includes("Thank you") || finalTranscript.includes("I appreciate")) {
        strengths.push("Credits: Conveying gratitude in your speech created a positive conclusion for the audience!");
    } else {
        improvement.push("Credits: Finishing the speech on a note of gratitude could create an engaging finish for the audience.");
    }

    const transitionWords = ["however", "therefore", "moreover", "for example", "in addition", "to contrast", "firstly", "secondly", "thirdly", "finally", "resulting in"];
    const transitionsUsed = transitionWords.filter(word => finalTranscript.toLowerCase().includes(word)).length;

    if (transitionsUsed >= 3) {
        strengths.push("Connection: Connecting ideas with transition words created a smooth feeling during the speech!");
    } else {
        improvement.push("Connection: Connecting ideas with transition words would create a more cohesive speech.");
    }

    const fillerWords = ["um", "uh", "like", "you know", "actually", "basically", "absolutely", "highly", "totally"];
    const fillerWordCounts = fillerWords.reduce((acc, word) => {
        const regex = new RegExp(`\\b${word}\\b`, "gi");
        const count = (finalTranscript.toLowerCase().match(regex) || []).length;
        if (count > 0) {
            acc.push(`${word} (${count})`);
        }
        return acc;
    }, []);

    if (fillerWordCounts.length > 0) {
        improvement.push(`Clarity: Reducing fillers such as ${fillerWordCounts.join(", ")} would allow for a more seamless delivery.`);
    } else {
        strengths.push("Clarity: Absence of filler words made the speech feel seamless!");
    }

    let durationSeconds = 0;
    if (recordedChunks && recordedChunks.length > 0) {
        durationSeconds = recordedChunks.length * 0.03;
    }
    const wordsPerMinute = durationSeconds > 0 ? Math.floor((wordCount / durationSeconds) * 60) : 0;

    if (wordsPerMinute > 200) {
        improvement.push("Clip: Slowing down will help the audience understand your speech better.");
    } else if (wordsPerMinute < 110) {
        improvement.push("Clip: Speeding up will help keep the audience's attention.");
    } else {
        strengths.push("Clip: Perfecting the speed of the speech helped the audience understand your points!");
    }

    let motionCount = detectHandMotions();

    if (motionCount > 5000) {
        strengths.push("Charisma: Effective hand gestures enhances your speech and delivery!");
    } else {
        improvement.push("Charisma: Consider using more expressive hand gestures to further engage the audience.");
    }

    const selectedImprovements = [];
    if (improvement.length > 3) {
        const shuffled = [...improvement].sort(() => 0.5 - Math.random());  // Create a copy to avoid modifying the original array
        const maxImprovements = 3;
        for (let i = 0; i < maxImprovements && i < shuffled.length; i++) {
            selectedImprovements.push(shuffled[i]);
        }
    } else {
        selectedImprovements.push(...improvement);
    }

    fillerFeedback.style.display = "block";
    strengthsFeedback.style.display = "block";
    improvementFeedback.style.display = "block";

    fillerFeedback.innerHTML = `<strong>Strengths:</strong><br>${strengths.join("<br>")}`;
    improvementFeedback.innerHTML = `<strong>Areas for Improvement:</strong><br>${selectedImprovements.join("<br>")}`;
    strengthsFeedback.innerHTML = `<strong>Speeches Delivered:</strong> ${speechesDelivered}`;

    //Update and show quest progress
    updateQuestProgress();
}

function blobToBase64(blob, callback) {
    const reader = new FileReader();
    reader.onload = function () {
        const dataUrl = reader.result;
        callback(dataUrl);
    };
    reader.readAsDataURL(blob);
}

function saveSpeechKey(key) {
    let speechKeys = localStorage.getItem('speechKeys');
    speechKeys = speechKeys ? JSON.parse(speechKeys) : [];
    speechKeys.push(key);
    localStorage.setItem('speechKeys', JSON.stringify(speechKeys));
}

// Function to retrieve speech keys (example)
function getSpeechKeys() {
    const speechKeys = localStorage.getItem('speechKeys');
    return speechKeys ? JSON.parse(speechKeys) : [];
}

function updateQuestProgress() {
    // Example quest progress logic - adjust based on your actual quests
    let questCompleted = false;

    if (speechesDelivered >= 5 && puzzlesCompleted >= 2 && speechesWatched >= 10) {
        questCompleted = true;
    }

    // Display the progress and completion status
    const progressDisplay = document.getElementById("quest-progress");

    if (progressDisplay) {
        progressDisplay.innerHTML = `
            <p>Speeches Delivered: ${speechesDelivered}</p>
            <p>Puzzles Completed: ${puzzlesCompleted}</p>
            <p>Speeches Watched: ${speechesWatched}</p>
            <p>Quest Completed: ${questCompleted ? "Yes!" : "Not Yet"}</p>
        `;
    }
}

// Call these functions when appropriate (e.g., on page load)
startVideoStream();
setupSpeechRecognition();
updateQuestProgress();
function updateQuestProgress() {
    // Retrieve current progress from localStorage
    const speechesDelivered = parseInt(localStorage.getItem("speechesDelivered")) || 0;
    const puzzlesCompleted = parseInt(localStorage.getItem("puzzlesCompleted")) || 0;
    const speechesWatched = parseInt(localStorage.getItem("speechesWatched")) || 0;

    // Calculate completion status
    const questCompleted = speechesDelivered >= 5 && 
                         puzzlesCompleted >= 2 && 
                         speechesWatched >= 10;

    // Update progress display
    const progressDisplay = document.getElementById("quest-progress");
    if (progressDisplay) {
        progressDisplay.innerHTML = `
            <div class="progress-item">
                <span class="progress-label">Speeches Delivered:</span>
                <span class="progress-value">${speechesDelivered}/5</span>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${(speechesDelivered/5)*100}%"></div>
                </div>
            </div>
            <div class="progress-item">
                <span class="progress-label">Puzzles Completed:</span>
                <span class="progress-value">${puzzlesCompleted}/2</span>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${(puzzlesCompleted/2)*100}%"></div>
                </div>
            </div>
            <div class="progress-item">
                <span class="progress-label">Speeches Watched:</span>
                <span class="progress-value">${speechesWatched}/10</span>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${(speechesWatched/10)*100}%"></div>
                </div>
            </div>
            <div class="quest-status">
                Quest Complete: ${questCompleted ? '✅' : '❌'}
                ${questCompleted ? 
                    '<div class="quest-reward">Reward Unlocked: Expert Speaker Badge!</div>' : 
                    '<div class="quest-reminder">Complete all objectives to unlock reward</div>'}
            </div>
        `;
    }

    // Unlock achievements if quest completed
    if (questCompleted && !localStorage.getItem("questCompleted")) {
        localStorage.setItem("questCompleted", "true");
        showAchievementUnlocked("Expert Speaker Badge");
    }
}

function showAchievementUnlocked(achievementName) {
    const achievementToast = document.createElement("div");
    achievementToast.className = "achievement-toast";
    achievementToast.innerHTML = `
        🎉 Achievement Unlocked!
        <div class="achievement-name">${achievementName}</div>
    `;
    document.body.appendChild(achievementToast);

    setTimeout(() => {
        achievementToast.remove();
    }, 5000);
}
