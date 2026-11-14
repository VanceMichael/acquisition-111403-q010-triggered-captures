export const seed={
  "device": "meter",
  "boot": "b1",
  "localTrigger": 3,
  "count": 3,
  "samples": [
    1,
    2,
    3
  ]
};
export const seedPath="/capture";
export const routes=[
  {
    "path": "/triggers",
    "body": {
      "items": [
        {
          "session": "s1",
          "triggerId": 3,
          "expected": {
            "meter": "delivered",
            "camera": "pending"
          }
        }
      ]
    },
    "method": "GET",
    "status": 200,
    "query": {},
    "headers": {}
  },
  {
    "path": "/bindings",
    "body": {
      "items": [
        {
          "session": "s1",
          "triggerId": 3,
          "device": "meter",
          "boot": "b1",
          "localTrigger": 3
        },
        {
          "session": "s1",
          "triggerId": 3,
          "device": "camera",
          "boot": "c1",
          "localTrigger": 7
        }
      ]
    },
    "method": "GET",
    "status": 200,
    "query": {},
    "headers": {}
  },
  {
    "path": "/segments",
    "body": {
      "items": [
        {
          "device": "meter",
          "boot": "b1",
          "localTrigger": 3,
          "preSamples": 2,
          "sampleRate": 10,
          "startTick": 80,
          "count": 3,
          "url": "/samples/meter"
        }
      ]
    },
    "method": "GET",
    "status": 200,
    "query": {},
    "headers": {}
  },
  {
    "path": "/samples/meter",
    "body": [
      1,
      2,
      3
    ],
    "method": "GET",
    "status": 200,
    "query": {},
    "headers": {}
  },
  {
    "path": "/clocks",
    "body": {
      "items": [
        {
          "device": "meter",
          "boot": "b1",
          "fromTick": 0,
          "toTick": 100,
          "offset": [
            1.0,
            1.2
          ],
          "scale": 0.1
        }
      ]
    },
    "method": "GET",
    "status": 200,
    "query": {},
    "headers": {}
  }
];
export const phases={
  "missed": [
    {
      "path": "/triggers",
      "body": {
        "items": [
          {
            "session": "s1",
            "triggerId": 3,
            "expected": {
              "meter": "delivered",
              "camera": "missed"
            }
          }
        ]
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    }
  ],
  "camera-arrived": [
    {
      "path": "/triggers",
      "body": {
        "items": [
          {
            "session": "s1",
            "triggerId": 3,
            "expected": {
              "meter": "delivered",
              "camera": "delivered"
            }
          }
        ]
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    },
    {
      "path": "/segments",
      "body": {
        "items": [
          {
            "device": "meter",
            "boot": "b1",
            "localTrigger": 3,
            "preSamples": 2,
            "sampleRate": 10,
            "startTick": 80,
            "count": 3,
            "url": "/samples/meter"
          },
          {
            "device": "camera",
            "boot": "c1",
            "localTrigger": 7,
            "preSamples": 0,
            "sampleRate": 2,
            "startTick": 20,
            "count": 2,
            "url": "/samples/camera"
          }
        ]
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    },
    {
      "path": "/samples/camera",
      "body": [
        7,
        8
      ],
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    }
  ]
};
export const portalKind="";
