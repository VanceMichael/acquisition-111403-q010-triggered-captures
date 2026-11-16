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
  ],
  "multi-trigger": [
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
          },
          {
            "session": "s1",
            "triggerId": 4,
            "expected": {
              "meter": "delivered",
              "camera": "pending"
            }
          },
          {
            "session": "s2",
            "triggerId": 0,
            "expected": {
              "meter": "delivered",
              "camera": "delivered"
            }
          },
          {
            "session": "s2",
            "triggerId": 1,
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
      "path": "/bindings",
      "body": {
        "items": [
          {"session": "s1", "triggerId": 3, "device": "meter", "boot": "b1", "localTrigger": 3},
          {"session": "s1", "triggerId": 3, "device": "camera", "boot": "c1", "localTrigger": 7},
          {"session": "s1", "triggerId": 4, "device": "meter", "boot": "b1", "localTrigger": 4},
          {"session": "s1", "triggerId": 4, "device": "camera", "boot": "c1", "localTrigger": 8},
          {"session": "s2", "triggerId": 0, "device": "meter", "boot": "b1", "localTrigger": 0},
          {"session": "s2", "triggerId": 0, "device": "camera", "boot": "c1", "localTrigger": 0},
          {"session": "s2", "triggerId": 1, "device": "meter", "boot": "b2", "localTrigger": 0},
          {"session": "s2", "triggerId": 1, "device": "camera", "boot": "c1", "localTrigger": 1}
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
          {"device": "meter", "boot": "b1", "localTrigger": 3, "preSamples": 2, "sampleRate": 10, "startTick": 80, "count": 3, "url": "/samples/mt/meter3"},
          {"device": "camera", "boot": "c1", "localTrigger": 7, "preSamples": 0, "sampleRate": 2, "startTick": 20, "count": 2, "url": "/samples/mt/camera7"},
          {"device": "meter", "boot": "b1", "localTrigger": 4, "preSamples": 1, "sampleRate": 5, "startTick": 10, "count": 4, "url": "/samples/mt/meter4"},
          {"device": "meter", "boot": "b1", "localTrigger": 0, "preSamples": 0, "sampleRate": 4, "startTick": 95, "count": 2, "url": "/samples/mt/meter0"},
          {"device": "camera", "boot": "c1", "localTrigger": 0, "preSamples": 0, "sampleRate": 2, "startTick": 30, "count": 2, "url": "/samples/mt/camera0"},
          {"device": "meter", "boot": "b2", "localTrigger": 0, "preSamples": 5, "sampleRate": 10, "startTick": 0, "count": 5, "url": "/samples/mt/meterb2"},
          {"device": "camera", "boot": "c1", "localTrigger": 1, "preSamples": 0, "sampleRate": 2, "startTick": 32, "count": 2, "url": "/samples/mt/camera1"}
        ]
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    },
    {
      "path": "/clocks",
      "body": {
        "items": [
          {"device": "meter", "boot": "b1", "fromTick": 0, "toTick": 100, "offset": [1.0, 1.2], "scale": 0.1},
          {"device": "meter", "boot": "b2", "fromTick": 0, "toTick": 100, "offset": [2.0, 2.5], "scale": 0.1},
          {"device": "camera", "boot": "c1", "fromTick": 0, "toTick": 50, "offset": [0.5, 0.55], "scale": 0.02}
        ]
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    },
    {"path": "/samples/mt/meter3", "body": [1, 2, 3], "method": "GET", "status": 200, "query": {}, "headers": {}},
    {"path": "/samples/mt/camera7", "body": [7, 8], "method": "GET", "status": 200, "query": {}, "headers": {}},
    {"path": "/samples/mt/meter4", "body": [4, 5, 6, 7], "method": "GET", "status": 200, "query": {}, "headers": {}},
    {"path": "/samples/mt/meter0", "body": [9, 10], "method": "GET", "status": 200, "query": {}, "headers": {}},
    {"path": "/samples/mt/camera0", "body": [1, 2], "method": "GET", "status": 200, "query": {}, "headers": {}},
    {"path": "/samples/mt/meterb2", "body": [0, 1, 2, 3, 4], "method": "GET", "status": 200, "query": {}, "headers": {}},
    {"path": "/samples/mt/camera1", "body": [3, 4], "method": "GET", "status": 200, "query": {}, "headers": {}}
  ],
  "partial-samples": [
    {
      "path": "/triggers",
      "body": {"items": [{"session": "s1", "triggerId": 3, "expected": {"meter": "delivered"}}]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/bindings",
      "body": {"items": [{"session": "s1", "triggerId": 3, "device": "meter", "boot": "b1", "localTrigger": 3}]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/segments",
      "body": {"items": [{"device": "meter", "boot": "b1", "localTrigger": 3, "preSamples": 0, "sampleRate": 5, "startTick": 10, "count": 5, "url": "/samples/split"}]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/clocks",
      "body": {"items": [{"device": "meter", "boot": "b1", "fromTick": 0, "toTick": 100, "offset": [1.0, 1.2], "scale": 0.1}]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {"path": "/samples/split", "body": [1, 2], "method": "GET", "status": 200, "query": {}, "headers": {}}
  ],
  "partial-samples-arrived": [
    {
      "path": "/triggers",
      "body": {"items": [{"session": "s1", "triggerId": 3, "expected": {"meter": "delivered"}}]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/bindings",
      "body": {"items": [{"session": "s1", "triggerId": 3, "device": "meter", "boot": "b1", "localTrigger": 3}]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/segments",
      "body": {"items": [{"device": "meter", "boot": "b1", "localTrigger": 3, "preSamples": 0, "sampleRate": 5, "startTick": 10, "count": 5, "url": "/samples/split"}]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/clocks",
      "body": {"items": [{"device": "meter", "boot": "b1", "fromTick": 0, "toTick": 100, "offset": [1.0, 1.2], "scale": 0.1}]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {"path": "/samples/split", "body": [1, 2, 3, 4, 5], "method": "GET", "status": 200, "query": {}, "headers": {}}
  ],
  "declaration-gap": [
    {
      "path": "/triggers",
      "body": {"items": [{"session": "s1", "triggerId": 3, "expected": {"meter": "delivered"}}]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/bindings",
      "body": {"items": [
        {"session": "s1", "triggerId": 3, "device": "meter", "boot": "b1", "localTrigger": 3},
        {"session": "s1", "triggerId": 3, "device": "camera", "boot": "c1", "localTrigger": 7}
      ]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/segments",
      "body": {"items": [
        {"device": "meter", "boot": "b1", "localTrigger": 3, "preSamples": 2, "sampleRate": 10, "startTick": 80, "count": 3, "url": "/samples/meter"},
        {"device": "camera", "boot": "c1", "localTrigger": 7, "preSamples": 0, "sampleRate": 2, "startTick": 20, "count": 7, "url": "/samples/gap/camera"}
      ]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {"path": "/samples/gap/camera", "body": [1, 2, 3, 4, 5, 6, 7], "method": "GET", "status": 200, "query": {}, "headers": {}}
  ],
  "missing-bindings": [
    {
      "path": "/triggers",
      "body": {"items": [{"session": "s1", "triggerId": 3, "expected": {"meter": "delivered"}}]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/bindings",
      "body": {"items": []},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/segments",
      "body": {"items": [{"device": "meter", "boot": "b1", "localTrigger": 3, "preSamples": 2, "sampleRate": 10, "startTick": 80, "count": 3, "url": "/samples/meter"}]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    }
  ],
  "unbound-segment": [
    {
      "path": "/triggers",
      "body": {"items": [{"session": "s1", "triggerId": 3, "expected": {"meter": "delivered", "camera": "delivered"}}]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/bindings",
      "body": {"items": [
        {"session": "s1", "triggerId": 3, "device": "meter", "boot": "b1", "localTrigger": 3},
        {"session": "s1", "triggerId": 3, "device": "camera", "boot": "c1", "localTrigger": 7}
      ]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/segments",
      "body": {"items": [
        {"device": "meter", "boot": "b1", "localTrigger": 3, "preSamples": 2, "sampleRate": 10, "startTick": 80, "count": 3, "url": "/samples/meter"},
        {"device": "camera", "localTrigger": 7, "preSamples": 0, "sampleRate": 2, "startTick": 20, "count": 2, "url": "/samples/camera"}
      ]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    }
  ],
  "trigger-reuse": [
    {
      "path": "/triggers",
      "body": {"items": [
        {"session": "s1", "triggerId": 5, "expected": {"meter": "delivered"}},
        {"session": "s2", "triggerId": 5, "expected": {"meter": "delivered"}}
      ]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/bindings",
      "body": {"items": [
        {"session": "s1", "triggerId": 5, "device": "meter", "boot": "b1", "localTrigger": 5},
        {"session": "s2", "triggerId": 5, "device": "meter", "boot": "b2", "localTrigger": 0}
      ]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/segments",
      "body": {"items": [
        {"device": "meter", "boot": "b1", "localTrigger": 5, "preSamples": 1, "sampleRate": 10, "startTick": 40, "count": 2, "url": "/samples/reuse/b1"},
        {"device": "meter", "boot": "b2", "localTrigger": 0, "preSamples": 1, "sampleRate": 10, "startTick": 60, "count": 3, "url": "/samples/reuse/b2"}
      ]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/clocks",
      "body": {"items": [
        {"device": "meter", "boot": "b1", "fromTick": 0, "toTick": 100, "offset": [1.0, 1.2], "scale": 0.1},
        {"device": "meter", "boot": "b2", "fromTick": 0, "toTick": 100, "offset": [5.0, 5.4], "scale": 0.1}
      ]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {"path": "/samples/reuse/b1", "body": [11, 12], "method": "GET", "status": 200, "query": {}, "headers": {}},
    {"path": "/samples/reuse/b2", "body": [21, 22, 23], "method": "GET", "status": 200, "query": {}, "headers": {}}
  ],
  "missed-then-arrived": [
    {
      "path": "/triggers",
      "body": {"items": [{"session": "s1", "triggerId": 3, "expected": {"meter": "delivered", "camera": "missed"}}]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/bindings",
      "body": {"items": [
        {"session": "s1", "triggerId": 3, "device": "meter", "boot": "b1", "localTrigger": 3},
        {"session": "s1", "triggerId": 3, "device": "camera", "boot": "c1", "localTrigger": 7}
      ]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/segments",
      "body": {"items": [
        {"device": "meter", "boot": "b1", "localTrigger": 3, "preSamples": 2, "sampleRate": 10, "startTick": 80, "count": 3, "url": "/samples/meter"},
        {"device": "camera", "boot": "c1", "localTrigger": 7, "preSamples": 0, "sampleRate": 2, "startTick": 20, "count": 2, "url": "/samples/camera"}
      ]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {
      "path": "/clocks",
      "body": {"items": [
        {"device": "meter", "boot": "b1", "fromTick": 0, "toTick": 100, "offset": [1.0, 1.2], "scale": 0.1},
        {"device": "camera", "boot": "c1", "fromTick": 0, "toTick": 50, "offset": [0.5, 0.55], "scale": 0.02}
      ]},
      "method": "GET", "status": 200, "query": {}, "headers": {}
    },
    {"path": "/samples/camera", "body": [7, 8], "method": "GET", "status": 200, "query": {}, "headers": {}}
  ]
};
export const portalKind="";
