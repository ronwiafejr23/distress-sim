window.SIGNALS = [
    {key: 'hr', label: 'Heart Rate', unit: 'bpm', min: 30, max: 220},
    {key: 'br', label: 'Breathing Rate', unit: '/min', min: 4, max: 60},
    {key: 'spo2', label: 'Blood Oxygen', unit: '%', min: 60, max: 100},
    {key: 'temp', label: 'Skin Temperature', unit: 'C', min: 28, max: 41},
    {key: 'stress', label: 'Blood Pressure', unit: '/100', min: 0, max: 100},
];

window.CREW = [
    {
        id: 'okafor', name: 'Maya Okafor', role: 'Commander',
        baseline: {
            hr: { mean: 62, sd: 5 },
            br: { mean: 14, sd: 1.5 },
            spo2: { mean: 98, sd: 0.8 },
            temp: { mean: 33.5, sd: 0.4 },
            stress: { mean: 20, sd: 5 },
        }
    },

    {
        id: 'reyes', name: 'Daniel Reyes', role: 'Flight Engineer',
        baseline: {
            hr: { mean: 50, sd: 4 },
            br: { mean: 12, sd: 1.2 },
            spo2: { mean: 97.5, sd: 0.8 },
            temp: { mean: 33.0, sd: 0.4 },
            stress: { mean: 15, sd: 5 },
        }
    },

    {
        id: 'lindqvist', name: 'Sara Lindqvist', role: 'Mission Specialist',
        baseline: {
            hr: { mean: 74, sd: 6 },
            br: { mean: 16, sd: 1.8 },
            spo2: { mean: 98.5, sd: 0.7 },
            temp: { mean: 34.0, sd: 0.5 },
            stress: { mean: 30, sd: 8 },
        }
    }
]

window.SCENARIOS = [
    {
        id: 'panic', name: 'Panic during spacewalk', 
        calm: 8, timeLimit: 90, recoverySeconds: 20,
        phases: [
            { name: 'onset', seconds: 6, shift: {hr: 14, br: 4, stress: 10 }},
            { name: 'escalation', seconds: 8, shift: {hr: 40, br: 10, stress: 45 }},
            { name: 'peak', seconds: 8, shift: {hr: 55, br: 14, stress: 65 }},
        ],

        actions: [
        { id: 'pause', label: 'Pause the task', effect: 'right'},
        { id: 'breathe', label: 'Start guided breathing', effect: 'right'},
        { id: 'buddy', label: 'Buddy check-in over the radio', effect: 'right'},
        { id: 'rush', label: 'Speed up to finish the task sooner', effect: 'wrong'},
        { id: 'ignore', label: 'keep working and recheck in 10 minutes', effect: 'wrong'},
        { id: 'log', label: 'Write the event in the mission log', effect: 'neutral'},
        ],

        hint: 'Mission Control: this looks like acute stress. Pause the task, ' +
          'start guided breathing and get a buddy check-in.'
    }
];